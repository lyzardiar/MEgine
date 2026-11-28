//! Optional Warcraft III / Frostbound plugin boundary for MEngine.
//!
//! Core engine crates (`mengine-assets`, `mengine-editor-host`) gate Warcraft III
//! formats (MPQ, BLP, MDX, SLK, W3X/W3M maps & terrain) behind the `warcraft`
//! Cargo feature so non-Warcraft, mobile, and web builds compile cleanly without
//! CMake/StormLib dependencies.

pub use mengine_assets::{
    decode_blp_mip_rgba8, warcraft_ground_layers, MdxAttachmentPose, MdxBillboardCamera,
    MdxGeosetPose, MdxLayerPose, MdxModel, MdxPose, MdxReadLimits, MdxSequence, MdxTexture,
    MpqAssetSource, WarcraftArchives, WarcraftCliffPlacement, WarcraftDecodedModel,
    WarcraftDecodedTexture, WarcraftDefinitionCache, WarcraftDefinitionCacheStats,
    WarcraftDefinitionDisposition, WarcraftDefinitionDomain, WarcraftDefinitionLimits,
    WarcraftDefinitionOverride, WarcraftDefinitionTable, WarcraftDefinitionValue,
    WarcraftGroundLayers, WarcraftGroundTile, WarcraftMapCancelToken, WarcraftMapDefinitions,
    WarcraftMapDoodad, WarcraftMapDoodads, WarcraftMapError, WarcraftMapFog, WarcraftMapForce,
    WarcraftMapInfo, WarcraftMapInventoryItem, WarcraftMapItemChoice, WarcraftMapLimits,
    WarcraftMapLoadPhase, WarcraftMapLoadProgress, WarcraftMapModifiedAbility, WarcraftMapObject,
    WarcraftMapObjectKind, WarcraftMapObjectModification, WarcraftMapObjectValue,
    WarcraftMapObjects, WarcraftMapPathing, WarcraftMapPlayer, WarcraftMapRandomItemChoice,
    WarcraftMapRandomItems, WarcraftMapRandomPlacement, WarcraftMapRandomUnitChoice,
    WarcraftMapRandomUnits, WarcraftMapScreen, WarcraftMapSession, WarcraftMapTech,
    WarcraftMapTerrain, WarcraftMapTerrainDoodad, WarcraftMapUnit, WarcraftMapUnits,
    WarcraftMapUpgrade, WarcraftMapWorldData, WarcraftPlacedWorld, WarcraftResourceCache,
    WarcraftResourceCacheStats, WarcraftStringTable, WarcraftTerrain, WarcraftTerrainChunk,
    WarcraftTerrainCorner, WarcraftTerrainLayout, WarcraftTerrainLimits, WarcraftTerrainMaterial,
    WarcraftTerrainResource, WarcraftTextureReplacement, WarcraftWater, WarcraftWaterSettings,
    WarcraftWorldAppearance, WarcraftWorldLimits, WarcraftWorldNode, WarcraftWorldNodeKind,
    WarcraftWorldTransform,
};
pub use mengine_mpq::{Archive, Archive as MpqArchive, MemberRead, MpqError};

pub const PLUGIN_ID: &str = "mengine.warcraft";
