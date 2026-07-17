use anyhow::{bail, Result};

#[derive(Clone, Debug)]
pub enum DefKind {
    Component,
    Command,
    Resource,
}

#[derive(Clone, Debug)]
pub struct Field {
    pub name: String,
    pub ty: String,
    pub optional: bool,
    pub default: Option<String>,
}

#[derive(Clone, Debug)]
pub struct Def {
    pub kind: DefKind,
    pub name: String,
    pub fields: Vec<Field>,
}

pub fn parse_idl(text: &str) -> Result<Vec<Def>> {
    let mut defs = Vec::new();
    let mut lines = text.lines().peekable();

    while let Some(raw) = lines.next() {
        let line = strip_comment(raw).trim().to_string();
        if line.is_empty() {
            continue;
        }

        let kind = if line.starts_with("component ") {
            DefKind::Component
        } else if line.starts_with("command ") {
            DefKind::Command
        } else if line.starts_with("resource ") {
            DefKind::Resource
        } else {
            bail!("unexpected line: {line}");
        };

        let rest = line.split_once(' ').map(|(_, r)| r.trim()).unwrap_or("");
        let name = rest.split('{').next().unwrap_or("").trim().to_string();
        if name.is_empty() {
            bail!("missing name in: {line}");
        }

        let mut fields = Vec::new();
        if !line.contains('}') {
            for raw in lines.by_ref() {
                let l = strip_comment(raw).trim().to_string();
                if l.is_empty() {
                    continue;
                }
                if l.starts_with('}') {
                    break;
                }
                fields.push(parse_field(&l)?);
            }
        }

        defs.push(Def { kind, name, fields });
    }

    Ok(defs)
}

fn strip_comment(line: &str) -> &str {
    line.split("//").next().unwrap_or(line)
}

fn parse_field(line: &str) -> Result<Field> {
    let line = line.trim().trim_end_matches(',').trim();
    let (left, default) = if let Some((l, d)) = line.split_once('=') {
        (l.trim(), Some(d.trim().to_string()))
    } else {
        (line, None)
    };

    let (name, ty_raw) = left
        .split_once(':')
        .ok_or_else(|| anyhow::anyhow!("bad field: {line}"))?;
    let mut ty = ty_raw.trim().to_string();
    let optional = ty.ends_with('?');
    if optional {
        ty = ty.trim_end_matches('?').trim().to_string();
    }

    Ok(Field {
        name: name.trim().to_string(),
        ty,
        optional,
        default,
    })
}
