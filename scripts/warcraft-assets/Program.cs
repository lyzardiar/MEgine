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

if (args.Length == 3 && args[0] == "--textures") {
    int count = 0;
    foreach (var path in Directory.EnumerateFiles(args[1], "*.blp", SearchOption.AllDirectories)) {
        var image = BlpReader.Decode(File.ReadAllBytes(path)) ?? throw new InvalidDataException($"BLP decode failed: {path}");
        string target = Path.Combine(args[2], Path.ChangeExtension(Path.GetRelativePath(args[1], path), ".png"));
        Directory.CreateDirectory(Path.GetDirectoryName(target)!);
        File.WriteAllBytes(target, PngWriter.Write(image));
        count++;
    }
    Console.WriteLine($"Decoded {count} BLP textures with original BGRA planes");
    return;
}
if (args.Length != 2) throw new ArgumentException("Usage: MdxExport <source.mdx> <output.json>");
var model = MdxReader.Read(File.ReadAllBytes(args[0]));
var animator = new MdxAnimator(model);
const float unitScale = 1f / 128;
float[] Position(Vector3 v) => [v.X * unitScale, v.Z * unitScale, -v.Y * unitScale];
float[] Direction(Vector3 v) => [v.X, v.Z, -v.Y];
object[] Geometry() => model.Geosets.Select(g => {
    var positions = new Vector3[g.VertexCount];
    var normals = new Vector3[g.VertexCount];
    animator.SkinGeoset(g, positions, normals);
    return (object)new { positions = positions.Select(Position), normals = normals.Select(Direction) };
}).ToArray();
object State(MdxSequence seq, int time, long wall) => new {
    geosets = model.Geosets.Select(g => new {
        alpha = animator.GeosetAlpha(g.Index, seq, time, wall),
        color = model.GeosetAnims.Where(a => a.GeosetId == g.Index).Select(a => animator.SampleVector(a.ColorTrack, seq, time, a.Color, wall)).Select(v => new[] { v.X, v.Y, v.Z }).FirstOrDefault() ?? [1f, 1f, 1f]
    }),
    materials = model.Materials.Select(m => m.Layers.Select(l => new {
        alpha = animator.SampleFloat(l.AlphaTrack, seq, time, l.Alpha, wall),
        texture = l.TextureIdTrack is null ? l.DiffuseTextureId : (int)animator.SampleFloat(l.TextureIdTrack, seq, time, l.DiffuseTextureId, wall)
    }).ToArray()).ToArray()
};
var clips = new List<object>();
foreach (var seq in model.Sequences) {
    float duration = (seq.IntervalEnd - seq.IntervalStart) / 1000f;
    if (duration <= 0 || duration > 100) throw new InvalidDataException($"Unsupported sequence duration: {seq.Name} {duration}");
    int frameCount = (int)Math.Ceiling(duration * 12);
    var frames = new List<object>();
    for (int frame = 0; frame <= frameCount; frame++) {
        float seconds = Math.Min(frame / 12f, duration);
        int time = seq.IntervalStart + (int)Math.Round(seconds * 1000);
        animator.Evaluate(seq, time, (long)Math.Round(seconds * 1000));
        var joints = Enumerable.Range(0, model.Nodes.Count).Select(i => {
            var (loc, rot, scale) = animator.LocalTrs(i);
            return new { translation = Position(loc), rotation = new[] { rot.X, rot.Z, -rot.Y, rot.W }, scale = new[] { scale.X, scale.Z, scale.Y } };
        }).ToArray();
        frames.Add(new { seconds, joints, state = State(seq, time, (long)Math.Round(seconds * 1000)), reference = frame == 0 || frame == frameCount / 2 || frame == frameCount - 1 ? Geometry() : null });
    }
    clips.Add(new { name = seq.Name, duration, loop = (seq.Flags & 1) == 0, frameCount, frames });
}
var stand = model.Sequences.FirstOrDefault(s => s.Name.Equals("Stand", StringComparison.OrdinalIgnoreCase)) ?? model.Sequences.FirstOrDefault(s => s.Name.StartsWith("Stand", StringComparison.OrdinalIgnoreCase)) ?? model.Sequences.FirstOrDefault();
animator.Evaluate(stand, stand?.IntervalStart ?? 0, 0);
var result = new { model, parents = Enumerable.Range(0, model.Nodes.Count).Select(animator.ParentIndex), restGeometry = Geometry(), previewSequence = stand?.Name, clips, hasBillboards = animator.HasBillboards };
File.WriteAllText(args[1], JsonSerializer.Serialize(result, new JsonSerializerOptions { IncludeFields = true, PropertyNamingPolicy = JsonNamingPolicy.CamelCase }));
Console.WriteLine($"{model.Name}: {model.Geosets.Count} geosets, {clips.Count} sequences, {model.Nodes.Count} joints");
