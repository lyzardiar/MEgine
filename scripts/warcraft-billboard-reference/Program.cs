/********************************************************************
 Copyright © 1998 - 2050 TL.lc All Rights Reserved.
 Created: 2026
 Filename: Program.cs
 Author: MiYu
 Descriptions: Independent source MDX camera-facing geometry references.
*********************************************************************/
using System.Globalization;
using System.Numerics;
using System.Text.Json;
using Wc3ModelViewer.Core.Formats;

if (args.Length != 8 && args.Length != 9) throw new ArgumentException("Usage: BillboardReference source.mdx output.json lookX lookY lookZ upX upY upZ [rate]");
int rate = args.Length == 9 ? int.Parse(args[8], CultureInfo.InvariantCulture) : 12;
if (rate < 1 || rate > 60) throw new ArgumentOutOfRangeException(nameof(rate));
float Value(int i) => float.Parse(args[i], CultureInfo.InvariantCulture);
var model = MdxReader.Read(File.ReadAllBytes(args[0]));
var animator = new MdxAnimator(model) { Camera = (new Vector3(Value(2), Value(3), Value(4)), new Vector3(Value(5), Value(6), Value(7))) };
var clips = new List<object>();
foreach (var sequence in model.Sequences) {
    float duration = (sequence.IntervalEnd - sequence.IntervalStart) / 1000f;
    if (duration <= 0) continue;
    int frames = (int)Math.Ceiling(duration * rate);
    var samples = new List<object>();
    foreach (int frame in args.Length == 9 ? new[] { 0, frames / 2, frames, frames + 3 } : new[] { 0, frames / 2, frames }) {
        float seconds = (sequence.Flags & 1) == 0 ? frame / (float)rate % duration : Math.Min(frame / (float)rate, duration);
        int time = sequence.IntervalStart + (int)Math.Round(seconds * 1000);
        animator.Evaluate(sequence, time, (long)Math.Round(seconds * 1000));
        var geosets = model.Geosets.Select(g => {
            var positions = new Vector3[g.VertexCount];animator.SkinGeoset(g, positions);
            return positions.Select(p => new[] { p.X / 128, p.Z / 128, -p.Y / 128 }).ToArray();
        }).ToArray();
        samples.Add(new { frame, geosets });
    }
    clips.Add(new { name = sequence.Name, samples });
}
File.WriteAllText(args[1], JsonSerializer.Serialize(new { clips }));
