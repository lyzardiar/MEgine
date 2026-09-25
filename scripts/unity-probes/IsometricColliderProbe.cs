/********************************************************************
 Copyright © 1998 - 2050 TL.lc All Rights Reserved.
 Created: 2023 ~ 2028
 Filename: IsometricColliderProbe.cs
 Author: MiYu
 Descriptions: Extract native collision shapes from pinned isometric cells.
*********************************************************************/
using System;
using System.IO;
using System.Collections.Generic;
using UnityEngine;
using UnityEngine.Tilemaps;
using UnityEditor;
public static class IsometricColliderProbe
{
    [Serializable] public class Cell { public Vector3Int cell; public string sprite; public Vector3 scale; }
    [Serializable] public class Map { public string name; public bool composite; public float radius; public float vertexDistance; public float offsetDistance; public Vector3 anchor; public Cell[] cells; }
    [Serializable] public class Input { public Map[] maps; }
    [Serializable] public class Shape { public string type; public float radius; public Vector2[] points; }
    [Serializable] public class Result { public string name; public bool composite; public int cells; public Shape[] shapes; }
    [Serializable] public class Output { public string unityVersion; public Result[] maps; }
    public static void Run()
    {
        var input = JsonUtility.FromJson<Input>(File.ReadAllText(Path.Combine(Application.dataPath, "../isometric-input.json")));
        var output = new List<Result>();
        foreach (var source in input.maps)
        {
            var grid = new GameObject("Grid").AddComponent<Grid>();
            grid.cellLayout = GridLayout.CellLayout.IsometricZAsY; grid.cellSize = new Vector3(1,.5f,1);
            var go = new GameObject(source.name); go.transform.parent = grid.transform;
            var map = go.AddComponent<Tilemap>(); map.tileAnchor = source.anchor;
            go.AddComponent<Rigidbody2D>().bodyType = RigidbodyType2D.Static;
            var composite = go.AddComponent<CompositeCollider2D>();
            composite.geometryType = CompositeCollider2D.GeometryType.Outlines;
            composite.generationType = CompositeCollider2D.GenerationType.Manual;
            composite.vertexDistance = source.vertexDistance; composite.offsetDistance = source.offsetDistance; composite.edgeRadius = source.radius;
            var collider = go.AddComponent<TilemapCollider2D>(); collider.usedByComposite = source.composite;
            foreach (var cell in source.cells)
            {
                var tile = ScriptableObject.CreateInstance<Tile>();
                tile.sprite = AssetDatabase.LoadAssetAtPath<Sprite>(cell.sprite);
                if (tile.sprite == null) throw new Exception("Missing sprite " + cell.sprite);
                tile.colliderType = Tile.ColliderType.Sprite; tile.flags = TileFlags.None;
                map.SetTile(cell.cell, tile); map.SetTransformMatrix(cell.cell, Matrix4x4.Scale(cell.scale));
            }
            collider.ProcessTilemapChanges(); Physics2D.SyncTransforms();
            if (source.composite) composite.GenerateGeometry();
            Collider2D active = source.composite ? (Collider2D)composite : collider;
            var group = new PhysicsShapeGroup2D(); active.GetShapes(group);
            var shapes = new List<Shape>();
            for (int i = 0; i < group.shapeCount; i++)
            {
                var shape = group.GetShape(i); var points = new List<Vector2>(); group.GetShapeVertices(i, points);
                for (int j = 0; j < points.Count; j++) points[j] = group.localToWorldMatrix.MultiplyPoint3x4(points[j]);
                shapes.Add(new Shape { type = shape.shapeType.ToString(), radius = shape.radius, points = points.ToArray() });
            }
            if (shapes.Count == 0) throw new Exception("Empty collider " + source.name);
            output.Add(new Result { name = source.name, composite = source.composite, cells = source.cells.Length, shapes = shapes.ToArray() });
            UnityEngine.Object.DestroyImmediate(grid.gameObject);
        }
        File.WriteAllText(Path.Combine(Application.dataPath, "../isometric-colliders.json"), JsonUtility.ToJson(new Output { unityVersion = Application.unityVersion, maps = output.ToArray() }, true));
        Debug.Log("ISO_PROBE_COMPLETE");
    }
}
