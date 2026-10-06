/********************************************************************
 Copyright © 1998 - 2050 TL.lc All Rights Reserved.
 Created: 2026
 Filename: Program.cs
 Author: MiYu
 Descriptions: Read source node flags and geoset joint order with the pinned MDX parser.
*********************************************************************/
using System.Text.Json;
using System.Numerics;
using Wc3ModelViewer.Core.Formats;

if (args.Length != 2) throw new ArgumentException("Usage: NodeMetadata source.mdx output.json");
var model = MdxReader.Read(File.ReadAllBytes(args[0]));
var animator = new MdxAnimator(model);
var ids = model.Nodes.Select((node, index) => (node.ObjectId, index)).ToDictionary(a => a.ObjectId, a => a.index);
var geosets = model.Geosets.Select(g => {
    if (g.HasSkin) throw new InvalidDataException("Classic matrix-group joints required");
    var groups = new List<int[]>();
    int offset = 0;
    foreach (int size in g.MatrixGroupSizes) {
        groups.Add(g.MatrixIndices.Skip(offset).Take(size).Select(id => ids[id]).ToArray());
        offset += size;
    }
    var used = g.VertexGroups.SelectMany(group => groups[group]).ToHashSet();
    foreach (int index in used.ToArray()) {
        var ancestors = new HashSet<int> { index };
        int parent = animator.ParentIndex(index);
        while (parent >= 0) {
            if (!ancestors.Add(parent)) throw new InvalidDataException("Cyclic source node hierarchy");
            used.Add(parent); parent = animator.ParentIndex(parent);
        }
    }
    return new { geoset = g.Index, usedNodes = used.Order().ToArray() };
}).ToArray();
object? Track<T>(MdxTrack<T>? track, Func<T, float[]> convert, bool collapseOutside = false) => track is null ? null : new { interpolation = (int)track.Interpolation, globalSequence = track.GlobalSequenceId, times = track.Times, values = track.Values.Select(convert), inTangents = track.InTangents?.Select(convert), outTangents = track.OutTangents?.Select(convert), collapseOutside };
float[] Translation(Vector3 v) => [v.X / 128, v.Z / 128, -v.Y / 128];
float[] Scale(Vector3 v) => [v.X, v.Z, v.Y];
float[] Rotation(Quaternion q) => [q.X, q.Z, -q.Y, q.W];
bool Collapses(MdxTrack<Vector3>? track) => track is { Count: > 1, GlobalSequenceId: < 0 } && track.Values[0].LengthSquared() < 1e-4f && track.Values[^1].LengthSquared() < 1e-4f && model.Sequences.Any(s => track.Times[0] >= s.IntervalStart && track.Times[^1] <= s.IntervalEnd);
var nodes = model.Nodes.Select((node, index) => new { index, name = node.Name, objectId = node.ObjectId, flags = (uint)node.Flags, parent = animator.ParentIndex(index), pivot = new[] { node.Pivot.X, node.Pivot.Y, node.Pivot.Z }, translation = Track(node.Translation, Translation), rotation = Track(node.Rotation, Rotation), scale = Track(node.Scale, Scale, Collapses(node.Scale)) });
var sequences = model.Sequences.Where(s => s.DurationMs > 0).Select(s => new { name = s.Name, start = s.IntervalStart, end = s.IntervalEnd });
File.WriteAllText(args[1], JsonSerializer.Serialize(new { nodes, geosets, sequences, globalSequences = model.GlobalSequences }));
