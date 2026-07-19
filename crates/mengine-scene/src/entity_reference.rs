use crate::SceneError;
use mengine_core::Entity;
use serde_json::{json, Value};
use std::collections::{HashMap, HashSet};

const TOKEN_KEY: &str = "$mengine_entity_ref";
const REFERENCE_FIELDS_KEY: &str = "__mengine_entity_reference_fields";
const COMPONENT_ENTITY_REFERENCE_FIELDS: [(&str, &str); 10] = [
    ("Button", "on_click"),
    ("Toggle", "on_value_changed"),
    ("Slider", "on_value_changed"),
    ("Scrollbar", "on_value_changed"),
    ("InputField", "on_value_changed"),
    ("InputField", "on_submit"),
    ("Dropdown", "on_value_changed"),
    ("ListView", "on_value_changed"),
    ("ScrollView", "on_value_changed"),
    ("TabView", "on_value_changed"),
];

enum PrefabReference<'a> {
    Node(&'a str),
    Missing,
}

fn decimal_entity(value: &Value) -> Option<u64> {
    value
        .as_u64()
        .or_else(|| value.as_str()?.trim().parse::<u64>().ok())
}

fn missing_reference(entity: u64) -> Value {
    json!({ TOKEN_KEY: { "kind": "missing", "entity": entity.to_string() } })
}

fn prefab_reference(value: &Value) -> Result<Option<PrefabReference<'_>>, SceneError> {
    let Some(wrapper) = value.as_object() else {
        return Ok(None);
    };
    let Some(raw) = wrapper.get(TOKEN_KEY) else {
        return Ok(None);
    };
    let raw = raw.as_object().ok_or_else(|| {
        SceneError::InvalidPrefab("serialized entity reference token must be an object".into())
    })?;
    match raw.get("kind").and_then(Value::as_str) {
        Some("prefab_node") => raw
            .get("node")
            .and_then(Value::as_str)
            .filter(|node| !node.trim().is_empty())
            .map(|node| Some(PrefabReference::Node(node.trim())))
            .ok_or_else(|| {
                SceneError::InvalidPrefab(
                    "prefab entity reference token requires a non-empty node".into(),
                )
            }),
        Some("missing") => {
            let valid = raw.get("entity").and_then(decimal_entity).is_some();
            if valid {
                Ok(Some(PrefabReference::Missing))
            } else {
                Err(SceneError::InvalidPrefab(
                    "missing entity reference token requires a decimal entity id".into(),
                ))
            }
        }
        _ => Err(SceneError::InvalidPrefab(
            "serialized entity reference token has an unsupported kind".into(),
        )),
    }
}

fn visit_targets_mut(
    components: &mut Value,
    mut visit: impl FnMut(&mut Value) -> Result<(), SceneError>,
) -> Result<(), SceneError> {
    let Some(components) = components.as_object_mut() else {
        return Ok(());
    };
    for (component_name, field_name) in COMPONENT_ENTITY_REFERENCE_FIELDS {
        let Some(component) = components
            .get_mut(component_name)
            .and_then(Value::as_object_mut)
        else {
            continue;
        };
        let Some(field) = component.get_mut(field_name) else {
            continue;
        };
        match field {
            Value::Object(call) => {
                if let Some(target) = call.get_mut("target") {
                    visit(target)?;
                }
            }
            Value::Array(calls) => {
                for call in calls.iter_mut().filter_map(Value::as_object_mut) {
                    if let Some(target) = call.get_mut("target") {
                        visit(target)?;
                    }
                }
            }
            _ => {}
        }
    }
    for (component_name, component) in components.iter_mut() {
        let Some(component) = component.as_object_mut() else {
            continue;
        };
        let Some(raw_fields) = component.get(REFERENCE_FIELDS_KEY) else {
            continue;
        };
        let fields = raw_fields.as_array().ok_or_else(|| {
            SceneError::InvalidPrefab(format!(
                "{component_name}.{REFERENCE_FIELDS_KEY} must be an array"
            ))
        })?;
        if fields.len() > 256 {
            return Err(SceneError::InvalidPrefab(format!(
                "{component_name}.{REFERENCE_FIELDS_KEY} exceeds 256 fields"
            )));
        }
        let fields = fields
            .iter()
            .map(|field| {
                field
                    .as_str()
                    .filter(|field| !field.is_empty() && *field != REFERENCE_FIELDS_KEY)
                    .map(str::to_owned)
                    .ok_or_else(|| {
                        SceneError::InvalidPrefab(format!(
                            "{component_name}.{REFERENCE_FIELDS_KEY} contains an invalid field"
                        ))
                    })
            })
            .collect::<Result<Vec<_>, _>>()?;
        for field in fields {
            if let Some(target) = component.get_mut(&field) {
                visit(target)?;
            }
        }
    }
    Ok(())
}

pub(crate) fn remap_scene_entity_references(
    components: &mut Value,
    entity_map: &HashMap<u64, Entity>,
) -> Result<(), SceneError> {
    visit_targets_mut(components, |target| {
        if target.is_null() || prefab_reference(target)?.is_some() {
            return Ok(());
        }
        let Some(old_entity) = decimal_entity(target) else {
            return Ok(());
        };
        *target = entity_map
            .get(&old_entity)
            .map(|entity| Value::String(entity.to_u64().to_string()))
            .unwrap_or_else(|| missing_reference(old_entity));
        Ok(())
    })
}

pub(crate) fn resolve_prefab_entity_references(
    components: &mut Value,
    node_entities: &HashMap<String, Entity>,
) -> Result<(), SceneError> {
    visit_targets_mut(components, |target| {
        match prefab_reference(target)? {
            Some(PrefabReference::Node(node)) => {
                let entity = node_entities.get(node).ok_or_else(|| {
                    SceneError::InvalidPrefab(format!(
                        "serialized entity reference points to missing prefab node '{node}'"
                    ))
                })?;
                *target = Value::String(entity.to_u64().to_string());
            }
            Some(PrefabReference::Missing) | None if target.is_null() => {}
            Some(PrefabReference::Missing) => {}
            None => {
                // A legacy Prefab can contain a raw scene id. Never let it bind to an
                // unrelated runtime entity that happens to reuse the same slot.
                if let Some(old_entity) = decimal_entity(target) {
                    *target = missing_reference(old_entity);
                }
            }
        }
        Ok(())
    })
}

pub(crate) fn validate_prefab_entity_references(
    components: &Value,
    node_ids: &HashSet<String>,
) -> Result<(), SceneError> {
    let mut cloned = components.clone();
    visit_targets_mut(&mut cloned, |target| {
        if let Some(PrefabReference::Node(node)) = prefab_reference(target)? {
            if !node_ids.contains(node) {
                return Err(SceneError::InvalidPrefab(format!(
                    "serialized entity reference points to missing prefab node '{node}'"
                )));
            }
        }
        Ok(())
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn scene_rebuild_remaps_ui_calls_and_marks_missing_targets() {
        let live = Entity::new(3, 2);
        let mut components = json!({
            "Button": { "on_click": { "target": 10, "component": "Menu", "method": "Open" } },
            "InputField": { "on_submit": { "target": "11", "method": "Submit" } }
        });
        remap_scene_entity_references(&mut components, &HashMap::from([(10, live)])).unwrap();
        assert_eq!(
            components["Button"]["on_click"]["target"],
            live.to_u64().to_string()
        );
        assert_eq!(
            components["InputField"]["on_submit"]["target"][TOKEN_KEY]["kind"],
            "missing"
        );
    }

    #[test]
    fn prefab_nodes_resolve_and_legacy_raw_ids_become_missing() {
        let target = Entity::new(8, 1);
        let mut components = json!({
            "Button": { "on_click": { "target": { TOKEN_KEY: { "kind": "prefab_node", "node": "label" } } } },
            "Toggle": { "on_value_changed": { "target": 99 } }
        });
        resolve_prefab_entity_references(
            &mut components,
            &HashMap::from([("label".to_owned(), target)]),
        )
        .unwrap();
        assert_eq!(
            components["Button"]["on_click"]["target"],
            target.to_u64().to_string()
        );
        assert_eq!(
            components["Toggle"]["on_value_changed"]["target"][TOKEN_KEY]["kind"],
            "missing"
        );
    }

    #[test]
    fn custom_behaviour_reference_metadata_uses_the_same_remap_contract() {
        let target = Entity::new(4, 3);
        let mut components = json!({
            "OpenDoorBehaviour": {
                REFERENCE_FIELDS_KEY: ["door"],
                "door": 20,
                "speed": 2
            }
        });
        remap_scene_entity_references(&mut components, &HashMap::from([(20, target)])).unwrap();
        assert_eq!(
            components["OpenDoorBehaviour"]["door"],
            target.to_u64().to_string()
        );
    }
}
