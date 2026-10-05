/********************************************************************
 Copyright © 1998 - 2050 TL.lc All Rights Reserved.
 Created: 2026
 Filename: Program.cs
 Author: MiYu
 Descriptions: Sample classic MDX with the pinned upstream parser and animator.
*********************************************************************/
using System.Numerics;
using System.Text.Json;
using Wc3ModelViewer.Core.Formats;

if (args.Length == 3 && args[0] == "--effects") { EffectExport.Write(args[1], args[2]); return; }
if (args.Length == 3 && args[0] == "--attachments") {
    var source = MdxReader.Read(File.ReadAllBytes(args[1]));
    var pose = new MdxAnimator(source);
    var attachments = source.Nodes.Select((node, index) => (node, index)).Where(a => a.node.Kind == MdxNodeKind.Attachment).ToArray();
    var tracks = new List<object>();
    foreach (var seq in source.Sequences) {
        double duration = (seq.IntervalEnd - seq.IntervalStart) / 1000.0;
        if (duration == 0) continue;
        if (duration < 0 || duration > 600) throw new InvalidDataException($"Unsupported attachment sequence: {seq.Name}");
        var frames = new List<object>();
        for (int frame = 0; frame <= (int)Math.Ceiling(duration * 12); frame++) {
            double seconds = Math.Min(frame / 12.0, duration);
            int time = Math.Min(seq.IntervalEnd, seq.IntervalStart + (int)Math.Round(seconds * 1000));
            pose.Evaluate(seq, time, (long)Math.Round(seconds * 1000));
            frames.Add(attachments.Select(a => {
                var p = Vector3.Transform(a.node.Pivot, pose.World(a.index));
                return new[] { p.X / 128, p.Z / 128, -p.Y / 128 };
            }).ToArray());
        }
        tracks.Add(new { name = seq.Name, duration, frames });
    }
    var data = new { fps = 12, names = attachments.Select(a => a.node.Name), clips = tracks };
    File.WriteAllText(args[2], JsonSerializer.Serialize(data, new JsonSerializerOptions { PropertyNamingPolicy = JsonNamingPolicy.CamelCase }));
    return;
}
if (args.Length == 3 && args[0] == "--textures") {
    int count = 0;
    foreach (var path in Directory.EnumerateFiles(args[1], "*.blp", SearchOption.AllDirectories)) {
        var image = BlpReader.Decode(File.ReadAllBytes(path));
        if (image is null) { Console.WriteLine($"Deferred BLP decode: {path}"); continue; }
        string target = Path.Combine(args[2], Path.ChangeExtension(Path.GetRelativePath(args[1], path), ".png"));
        Directory.CreateDirectory(Path.GetDirectoryName(target)!);
        File.WriteAllBytes(target, PngWriter.Write(image));
        count++;
    }
    Console.WriteLine($"Decoded {count} BLP textures with original BGRA planes");
    return;
}
if (args.Length != 2) throw new ArgumentException("Usage: MdxExport <source.mdx> <output.json>");
var bytes = File.ReadAllBytes(args[0]);
var model = MdxReader.Read(bytes);
var staticPivotRepairs = new List<int>();
foreach (var node in model.Nodes) {
    if (float.IsFinite(node.Pivot.X) && float.IsFinite(node.Pivot.Y) && float.IsFinite(node.Pivot.Z)) continue;
    if (node.Animated || node.Kind != MdxNodeKind.Bone && node.Kind != MdxNodeKind.Helper) throw new InvalidDataException($"Non-finite animated or effect pivot: {node.Name}");
    // An unanimated node has an identity world matrix; its pivot cancels in bind and pose.
    node.Pivot = Vector3.Zero;
    if (node.ObjectId >= 0 && node.ObjectId < model.Pivots.Count) model.Pivots[node.ObjectId] = Vector3.Zero;
    staticPivotRepairs.Add(node.ObjectId);
}
var animator = new MdxAnimator(model);
var uvAnimator = TextureTracks.Read(bytes, model);
var required = model.Geosets.SelectMany(g => g.MatrixIndices).Select(id => model.Nodes.FindIndex(n => n.ObjectId == id)).Where(i => i >= 0).ToHashSet();
foreach (int node in required.ToArray()) {
    int parent = animator.ParentIndex(node);
    while (parent >= 0) { required.Add(parent); parent = animator.ParentIndex(parent); }
}
var isolated = new Dictionary<int, MdxAnimator>();
foreach (int node in required) {
    var single = new MdxModel(); single.GlobalSequences.AddRange(model.GlobalSequences); single.Nodes.Add(model.Nodes[node]);
    isolated[node] = new MdxAnimator(single);
}
bool Finite(Vector3 v) => float.IsFinite(v.X) && float.IsFinite(v.Y) && float.IsFinite(v.Z);
bool Collapsed(Matrix4x4 m) => m.M11 == 0 && m.M12 == 0 && m.M13 == 0 && m.M21 == 0 && m.M22 == 0 && m.M23 == 0 && m.M31 == 0 && m.M32 == 0 && m.M33 == 0;
(Vector3 Loc, Quaternion Rot, Vector3 Scale) Local(int node, MdxSequence seq, int time, long wall) {
    var value = animator.LocalTrs(node);
    if (Finite(value.Loc) && Finite(value.Scale) && float.IsFinite(value.Rot.LengthSquared())) {
        int p = animator.ParentIndex(node);
        if (Collapsed(animator.World(node)) && (p < 0 || !Collapsed(animator.World(p)))) value.Scale = Vector3.Zero;
        return value;
    }
    // A collapsed parent has no inverse. Its child's source keys still define a finite local pose.
    var direct = isolated[node]; direct.Evaluate(seq, time, wall);
    value = direct.LocalTrs(0);
    if (Collapsed(direct.World(0))) value.Scale = Vector3.Zero;
    int parent = animator.ParentIndex(node);
    value.Loc -= parent >= 0 ? model.Nodes[parent].Pivot : Vector3.Zero;
    return value;
}
const float unitScale = 1f / 128;
float[] Position(Vector3 v) => [v.X * unitScale, v.Z * unitScale, -v.Y * unitScale];
float[] Direction(Vector3 v) => [v.X, v.Z, -v.Y];
Vector3[] FaceNormals(MdxGeoset g, Vector3[] positions) {
    var normals = new Vector3[positions.Length];
    for (int i = 0; i + 2 < g.Indices.Length; i += 3) {
        int a = g.Indices[i], b = g.Indices[i + 1], c = g.Indices[i + 2];
        var n = Vector3.Cross(positions[b] - positions[a], positions[c] - positions[a]);
        normals[a] += n; normals[b] += n; normals[c] += n;
    }
    for (int i = 0; i < normals.Length; i++) normals[i] = normals[i].LengthSquared() > 1e-10f ? Vector3.Normalize(normals[i]) : Vector3.UnitZ;
    return normals;
}
object[] Geometry() => model.Geosets.Select(g => {
    var positions = new Vector3[g.VertexCount];
    var normals = new Vector3[g.VertexCount];
    if (g.Normals.Length != 0 && g.Normals.Length != g.VertexCount) throw new InvalidDataException($"Incomplete source normals: geoset {g.Index}");
    animator.SkinGeoset(g, positions, g.Normals.Length == 0 ? null : normals);
    if (g.Normals.Length == 0) normals = FaceNormals(g, positions);
    return (object)new { positions = positions.Select(Position), normals = normals.Select(Direction) };
}).ToArray();
object State(MdxSequence? seq, int time, long wall) => new {
    geosets = model.Geosets.Select(g => new {
        alpha = animator.GeosetAlpha(g.Index, seq, time, wall),
        color = model.GeosetAnims.Where(a => a.GeosetId == g.Index).Select(a => animator.SampleVector(a.ColorTrack, seq, time, a.Color, wall)).Select(v => new[] { v.X, v.Y, v.Z }).FirstOrDefault() ?? [1f, 1f, 1f]
    }),
    materials = model.Materials.Select(m => m.Layers.Select(l => new {
        alpha = animator.SampleFloat(l.AlphaTrack, seq, time, l.Alpha, wall),
        texture = TextureId(l, time, wall),
        uv = l.TextureAnimationId < 0 ? new[] { 1f, 0f, 0f, 1f, 0f, 0f } : UvMatrix(l.TextureAnimationId)
    }).ToArray()).ToArray()
};
int TextureId(MdxLayer layer, int time, long wall) {
    if (layer.TextureIdTrack is null) return layer.DiffuseTextureId;
    int id = layer.TextureIdTrack.GlobalSequenceId;
    if (id >= 0) {
        uint period = model.GlobalSequences[id];
        time = period > 0 ? (int)(wall % period) : 0;
    }
    return layer.TextureIdAt(time);
}
float[] UvMatrix(int index) {
    var m = uvAnimator.World(index);
    return [m.M11, m.M12, m.M21, m.M22, m.M41, m.M42];
}
var clips = new List<object>();
foreach (var seq in model.Sequences) {
    float duration = (seq.IntervalEnd - seq.IntervalStart) / 1000f;
    if (duration == 0) continue;
    if (duration < 0 || duration > 600) throw new InvalidDataException($"Unsupported sequence duration: {seq.Name} {duration}");
    int frameCount = (int)Math.Ceiling(duration * 12);
    var frames = new List<object>();
    for (int frame = 0; frame <= frameCount; frame++) {
        float seconds = Math.Min(frame / 12f, duration);
        int time = seq.IntervalStart + (int)Math.Round(seconds * 1000);
        animator.Evaluate(seq, time, (long)Math.Round(seconds * 1000));
        uvAnimator.Evaluate(seq, time, (long)Math.Round(seconds * 1000));
        var joints = Enumerable.Range(0, model.Nodes.Count).Select(i => {
            int parent = animator.ParentIndex(i);
            var (loc, rot, scale) = required.Contains(i) ? Local(i,seq,time,(long)Math.Round(seconds*1000)) : (model.Nodes[i].Pivot - (parent >= 0 ? model.Nodes[parent].Pivot : Vector3.Zero), Quaternion.Identity, Vector3.One);
            return new { translation = Position(loc), rotation = new[] { rot.X, rot.Z, -rot.Y, rot.W }, scale = new[] { scale.X, scale.Z, scale.Y } };
        }).ToArray();
        frames.Add(new { seconds, joints, state = State(seq, time, (long)Math.Round(seconds * 1000)), reference = frame == 0 || frame == frameCount / 2 || frame == frameCount - 1 || frame == frameCount ? Geometry() : null });
    }
    clips.Add(new { name = seq.Name, duration, loop = (seq.Flags & 1) == 0, frameCount, frames });
}
var stand = model.Sequences.FirstOrDefault(s => s.Name.Equals("Stand", StringComparison.OrdinalIgnoreCase)) ?? model.Sequences.FirstOrDefault(s => s.Name.StartsWith("Stand", StringComparison.OrdinalIgnoreCase)) ?? model.Sequences.FirstOrDefault();
animator.Evaluate(stand, stand?.IntervalStart ?? 0, 0);
uvAnimator.Evaluate(stand, stand?.IntervalStart ?? 0, 0);
var result = new { model, parents = Enumerable.Range(0, model.Nodes.Count).Select(animator.ParentIndex), restGeometry = Geometry(), previewState = State(stand, stand?.IntervalStart ?? 0, 0), previewSequence = stand?.Name, clips, hasBillboards = animator.HasBillboards, staticPivotRepairs };
try {
    File.WriteAllText(args[1], JsonSerializer.Serialize(result, new JsonSerializerOptions { IncludeFields = true, PropertyNamingPolicy = JsonNamingPolicy.CamelCase }));
} catch (ArgumentException error) {
    string diagnostic = args[1] + ".invalid.json";
    File.WriteAllText(diagnostic, JsonSerializer.Serialize(result, new JsonSerializerOptions { IncludeFields = true, PropertyNamingPolicy = JsonNamingPolicy.CamelCase, NumberHandling = System.Text.Json.Serialization.JsonNumberHandling.AllowNamedFloatingPointLiterals }));
    throw new InvalidDataException($"Non-finite MDX sample; diagnostic: {diagnostic}", error);
}
Console.WriteLine($"{model.Name}: {model.Geosets.Count} geosets, {clips.Count} sequences, {model.Nodes.Count} joints");
