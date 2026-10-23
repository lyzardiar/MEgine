// Author: MiYu. Parse op-first component payloads once while preserving general command JSON compatibility.
use mengine_core::command::WorldCommand;
use serde::{Deserialize, Deserializer, de::{self, DeserializeSeed, MapAccess, Visitor, value::{MapAccessDeserializer, StringDeserializer}}};
use serde_json::Value;
use std::fmt;

pub(super) struct BatchCommand(pub WorldCommand);

#[derive(Deserialize)]
#[serde(field_identifier, rename_all = "camelCase")]
enum ComponentField { Entity, Component, Value, Op, #[serde(other)] Other }

// MiYu: replay the consumed prefix when a command requires the general tagged-enum parser.
struct PrefixedMap<M> { inner: M, key: Option<String>, value: Option<String> }
impl<'de, M: MapAccess<'de>> MapAccess<'de> for PrefixedMap<M> {
    type Error = M::Error;
    fn next_key_seed<K: DeserializeSeed<'de>>(&mut self, seed: K) -> Result<Option<K::Value>, Self::Error> {
        if let Some(key) = self.key.take() { seed.deserialize(StringDeserializer::<M::Error>::new(key)).map(Some) } else { self.inner.next_key_seed(seed) }
    }
    fn next_value_seed<V: DeserializeSeed<'de>>(&mut self, seed: V) -> Result<V::Value, Self::Error> {
        if let Some(value) = self.value.take() { seed.deserialize(StringDeserializer::<M::Error>::new(value)) } else { self.inner.next_value_seed(seed) }
    }
}

impl<'de> Deserialize<'de> for BatchCommand {
    fn deserialize<D: Deserializer<'de>>(deserializer: D) -> Result<Self, D::Error> {
        struct CommandVisitor;
        impl<'de> Visitor<'de> for CommandVisitor {
            type Value = BatchCommand;
            fn expecting(&self, formatter: &mut fmt::Formatter) -> fmt::Result { formatter.write_str("a world command object") }
            fn visit_map<M: MapAccess<'de>>(self, mut map: M) -> Result<Self::Value, M::Error> {
                let key = map.next_key::<String>()?;
                let op = if key.as_deref() == Some("op") { Some(map.next_value::<String>()?) } else { None };
                if op.as_deref() != Some("setComponent") {
                    return WorldCommand::deserialize(MapAccessDeserializer::new(PrefixedMap { inner: map, key, value: op })).map(BatchCommand);
                }
                let (mut entity, mut component, mut value) = (None, None, None);
                while let Some(field) = map.next_key::<ComponentField>()? {
                    match field {
                        ComponentField::Entity => { if entity.is_some() { return Err(de::Error::duplicate_field("entity")); } entity = Some(map.next_value::<u64>()?); }
                        ComponentField::Component => { if component.is_some() { return Err(de::Error::duplicate_field("component")); } component = Some(map.next_value::<String>()?); }
                        ComponentField::Value => { if value.is_some() { return Err(de::Error::duplicate_field("value")); } value = Some(map.next_value::<Value>()?); }
                        ComponentField::Op => return Err(de::Error::duplicate_field("op")),
                        ComponentField::Other => { map.next_value::<de::IgnoredAny>()?; }
                    }
                }
                Ok(BatchCommand(WorldCommand::SetComponent { entity: entity.ok_or_else(|| de::Error::missing_field("entity"))?, component: component.ok_or_else(|| de::Error::missing_field("component"))?, value: value.ok_or_else(|| de::Error::missing_field("value"))? }))
            }
        }
        deserializer.deserialize_map(CommandVisitor)
    }
}
