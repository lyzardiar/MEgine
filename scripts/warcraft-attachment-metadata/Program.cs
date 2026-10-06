/********************************************************************
 Copyright © 1998 - 2050 TL.lc All Rights Reserved.
 Created: 2026
 Filename: Program.cs
 Author: MiYu
 Descriptions: Export attachment definitions and independent source pose references.
*********************************************************************/
using System.Globalization;
using System.Numerics;
using System.Text.Json;
using Wc3ModelViewer.Core.Formats;

if (args is ["--self-test"]) { AttachmentTests.Run(); return; }
if (args.Length != 2 && args.Length != 9) throw new ArgumentException("Usage: AttachmentMetadata source.mdx output.json [lookX lookY lookZ upX upY upZ rate]");
var bytes = File.ReadAllBytes(args[0]);
var attachments = AttachmentTracks.Read(bytes);
var model = MdxReader.Read(bytes);
var animator = new MdxAnimator(model);
var indices = model.Nodes.Select((n, i) => (n.ObjectId, index: i)).ToDictionary(n => n.ObjectId, n => n.index);
foreach (var a in attachments) {
    if (!indices.ContainsKey(a.ObjectId) || a.Visibility?.GlobalSequenceId >= model.GlobalSequences.Count) throw new InvalidDataException("Attachment references invalid node or global sequence");
}
object? Track(MdxTrack<float>? t) => t is null ? null : new { interpolation = (uint)t.Interpolation, globalSequence = t.GlobalSequenceId, times = t.Times, values = t.Values.Select(v => new[] { v }), inTangents = t.InTangents?.Select(v => new[] { v }), outTangents = t.OutTangents?.Select(v => new[] { v }) };
var definitions = attachments.Select(a => new { sourceNode = indices[a.ObjectId], objectId = a.ObjectId, id = a.Id, path = a.Path, visibility = Track(a.Visibility) }).ToArray();
var clips = new List<object>();
if (args.Length == 9) {
    float Value(int i) => float.Parse(args[i], CultureInfo.InvariantCulture);
    int rate = int.Parse(args[8], CultureInfo.InvariantCulture);
    if (rate < 1 || rate > 60) throw new ArgumentOutOfRangeException(nameof(rate));
    animator.Camera = (new Vector3(Value(2), Value(3), Value(4)), new Vector3(Value(5), Value(6), Value(7)));
    foreach (var sequence in model.Sequences.Where(s => s.DurationMs > 0)) {
        float duration = sequence.DurationMs / 1000f; int count = (int)Math.Ceiling(duration * rate);
        var frames = new HashSet<int> { 0, count / 2, count, count + 3 };
        foreach (var a in attachments) if (a.Visibility is { GlobalSequenceId: < 0 } t) foreach (int key in t.Times.Where(k => k >= sequence.IntervalStart && k <= sequence.IntervalEnd)) {
            int f = (int)Math.Floor((key - sequence.IntervalStart) / 1000d * rate);
            foreach (int candidate in new[] { f - 1, f, f + 1 }) if (candidate >= 0 && candidate <= count) frames.Add(candidate);
        }
        var samples = new List<object>();
        foreach (int frame in frames.Order()) {
            float seconds = (sequence.Flags & 1) == 0 ? frame / (float)rate % duration : Math.Min(frame / (float)rate, duration);
            int wall = (int)Math.Round(seconds * 1000); int time = sequence.IntervalStart + wall;
            animator.Evaluate(sequence, time, wall);
            var nodes = model.Nodes.Select((node, index) => {
                var world = animator.World(index); var p = Vector3.Transform(node.Pivot, world);
                var x = Vector3.TransformNormal(Vector3.UnitX, world); var y = Vector3.TransformNormal(Vector3.UnitZ, world); var z = Vector3.TransformNormal(-Vector3.UnitY, world);
                var matrix = new[] { x.X, x.Z, -x.Y, 0, y.X, y.Z, -y.Y, 0, z.X, z.Z, -z.Y, 0, p.X / 128, p.Z / 128, -p.Y / 128, 1 };
                var a = attachments.FirstOrDefault(a => a.ObjectId == node.ObjectId);
                return new { sourceNode = index, position = new[] { p.X / 128, p.Z / 128, -p.Y / 128 }, matrix, visibility = a is null ? (float?)null : animator.SampleFloat(a.Visibility, sequence, time, 1, wall) };
            }).ToArray();
            samples.Add(new { frame, nodes });
        }
        clips.Add(new { name = sequence.Name, samples });
    }
}
File.WriteAllText(args[1], JsonSerializer.Serialize(new { attachments = definitions, clips }));
