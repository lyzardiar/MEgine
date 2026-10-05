/********************************************************************
 Copyright © 1998 - 2050 TL.lc All Rights Reserved.
 Created: 2026
 Filename: EffectExport.cs
 Author: MiYu
 Descriptions: Deterministically sample classic MDX effects for native playback.
*********************************************************************/
using System.Numerics;
using System.Text.Json;
using Wc3ModelViewer.Core.Formats;

internal static class EffectExport {
    public static void Write(string source, string target) {
        var model = MdxReader.Read(File.ReadAllBytes(source));
        if (model.Geosets.Count != 0) throw new InvalidDataException("Use the geometry converter for geoset models");
        var animator = new MdxAnimator(model);
        var simulation = new MdxEffectSimulator(model);
        const float unit = 1f / 128;
        float[] Position(Vector3 v) => [v.X * unit, v.Z * unit, -v.Y * unit];
        float[] Color(Vector3 v, float alpha) => [v.X, v.Y, v.Z, alpha];
        var materials = new List<object>();
        foreach (var e in model.ParticleEmitters) materials.Add(new { textureId = e.TextureId, replaceableId = e.ReplaceableId, blend = e.Blend switch { MdxParticleBlend.Add => "additive", MdxParticleBlend.Modulate or MdxParticleBlend.Modulate2X => "multiply", _ => "alpha" }, alphaCutoff = e.Blend == MdxParticleBlend.AlphaKey ? .75f : 0f });
        var ribbonMaterials = new List<int>();
        foreach (var e in model.RibbonEmitters) {
            if (e.MaterialId < 0 || e.MaterialId >= model.Materials.Count) throw new InvalidDataException($"Invalid ribbon material: {e.Name}");
            var layer = model.Materials[e.MaterialId].Layers.First();
            ribbonMaterials.Add(materials.Count);
            materials.Add(new { textureId = layer.DiffuseTextureId, replaceableId = 0, blend = (int)layer.FilterMode switch { 3 or 4 => "additive", 5 or 6 => "multiply", _ => "alpha" }, alphaCutoff = (int)layer.FilterMode == 1 ? .75f : 0f });
        }
        object Frame(MdxSequence? seq, int time, long wall, float seconds) {
            var particles = new List<object>();
            foreach (var p in simulation.Particles) {
                var e = model.ParticleEmitters[p.Emitter];
                var (color, alpha, scale) = simulation.Appearance(p);
                var uv = simulation.CellUv(p);
                if (alpha <= 0 || scale <= 0) continue;
                if (e.ParticleType != MdxParticleType.Tail) particles.Add(new { material = p.Emitter, position = Position(p.Position), size = scale * unit, color = Color(color, alpha), uv = new[] { uv.U0, uv.V0, uv.U1 - uv.U0, uv.V1 - uv.V0 } });
            }
            var quads = new List<object>();
            foreach (var p in simulation.Particles) {
                var e = model.ParticleEmitters[p.Emitter];
                if (e.ParticleType == MdxParticleType.Head) continue;
                var (color, alpha, scale) = simulation.Appearance(p);
                var uv = simulation.CellUv(p);
                // The tail is oriented to the camera at playback; keep its endpoints and width.
                quads.Add(new { material = p.Emitter, tail = new[] { Position(p.Position), Position(p.Position - p.Velocity * e.TailLength) }, width = scale * unit, color = Color(color, alpha), uv = new[] { uv.U0, uv.V0, uv.U1 - uv.U0, uv.V1 - uv.V0 } });
            }
            foreach (var trail in simulation.Trails) {
                var e = model.RibbonEmitters[trail.Emitter];
                var color = animator.SampleVector(e.ColorTrack, seq, time, e.Color, wall);
                float alpha = animator.SampleFloat(e.AlphaTrack, seq, time, e.Alpha, wall);
                int count = trail.Edges.Count;
                for (int i = 1; i < count; i++) {
                    var a = trail.Edges[i - 1]; var b = trail.Edges[i];
                    float cellWidth = 1f / Math.Max(1, e.Columns), cellHeight = 1f / Math.Max(1, e.Rows);
                    int cell = Math.Clamp(e.TextureSlot, 0, Math.Max(1, e.Columns * e.Rows) - 1);
                    quads.Add(new { material = ribbonMaterials[trail.Emitter], corners = new[] { Position(a.Above), Position(b.Above), Position(b.Below), Position(a.Below) }, color = Color(color, alpha), uv = new[] { (cell % Math.Max(1, e.Columns) + (i - 1f) / Math.Max(1, count - 1)) * cellWidth, (cell / Math.Max(1, e.Columns)) * cellHeight, cellWidth / Math.Max(1, count - 1), cellHeight } });
                }
            }
            var lights = model.Lights.Select(e => {
                Vector3 position = e.NodeIndex >= 0 ? Vector3.Transform(model.Nodes[e.NodeIndex].Pivot, animator.World(e.NodeIndex)) : Vector3.Zero;
                return new { kind = e.LightType.ToString().ToLowerInvariant(), position = Position(position), color = Color(animator.SampleVector(e.ColorTrack, seq, time, e.Color, wall), 1), intensity = animator.SampleFloat(e.IntensityTrack, seq, time, e.Intensity, wall), range = animator.SampleFloat(e.AttenuationEndTrack, seq, time, e.AttenuationEnd, wall) * unit, ambientColor = Color(e.AmbientColor, e.AmbientIntensity) };
            }).ToArray();
            return new { seconds, particles, quads, lights };
        }
        var clips = new List<object>();
        var sequences = model.Sequences.Cast<MdxSequence?>().ToList();
        if (sequences.Count == 0) sequences.Add(null);
        foreach (var seq in sequences) {
            float duration = seq is null ? 1 : (seq.IntervalEnd - seq.IntervalStart) / 1000f;
            if (duration <= 0) continue;
            if (duration > 600) throw new InvalidDataException("Effect duration exceeds 600 seconds");
            simulation.Reset();
            bool looping = seq is null || (seq.Flags & 1) == 0;
            float prewarmSeconds = 0;
            var constantEmitters = model.ParticleEmitters.Where(e => e.EmissionRate > 0).ToArray();
            // A sparse looping emitter must carry spawn credit across its source interval.
            if (looping && constantEmitters.Length > 0 && constantEmitters.All(e => e.EmissionRateTrack is null && e.EmissionRate * duration < 1)) {
                prewarmSeconds = Math.Min(60, constantEmitters.Max(e => e.Life) + 1 / constantEmitters.Min(e => e.EmissionRate));
                float warm = 0;
                while (warm < prewarmSeconds) {
                    float next = Math.Min(warm + 1f / 60, prewarmSeconds);
                    int time = (int)(seq?.IntervalStart ?? 0) + (int)Math.Round((next % duration) * 1000);
                    animator.Evaluate(seq, time, (long)Math.Round(next * 1000));
                    simulation.Update(next - warm, animator, seq, time, (long)Math.Round(next * 1000));
                    warm = next;
                }
            }
            var frames = new List<object>();
            float previous = 0;
            int intervals = (int)Math.Ceiling(duration * 12);
            for (int frame = 0; frame <= intervals; frame++) {
                float seconds = Math.Min(frame / 12f, duration);
                while (previous < seconds) {
                    float next = Math.Min(previous + 1f / 60, seconds);
                    int time = (int)(seq?.IntervalStart ?? 0) + (int)Math.Round(next * 1000);
                    animator.Evaluate(seq, time, (long)Math.Round((next + prewarmSeconds) * 1000));
                    simulation.Update(next - previous, animator, seq, time, (long)Math.Round((next + prewarmSeconds) * 1000));
                    previous = next;
                }
                int exactTime = (int)(seq?.IntervalStart ?? 0) + (int)Math.Round(seconds * 1000);
                animator.Evaluate(seq, exactTime, (long)Math.Round((seconds + prewarmSeconds) * 1000));
                frames.Add(Frame(seq, exactTime, (long)Math.Round((seconds + prewarmSeconds) * 1000), seconds));
            }
            clips.Add(new { name = seq?.Name ?? "Stand", duration, loop = looping, prewarmSeconds, frames });
        }
        var result = new { schemaVersion = 1, fps = 12, name = model.Name, materials, clips, sourceModel = model, scope = "Deterministic sampled viewer simulation. Particle randomness, squirt, model-space transport and ribbon emission differ from the original game solver. Camera and helper tracks are preserved as source metadata." };
        File.WriteAllText(target, JsonSerializer.Serialize(result, new JsonSerializerOptions { IncludeFields = true, PropertyNamingPolicy = JsonNamingPolicy.CamelCase }));
        Console.WriteLine($"{model.Name}: {clips.Count} effect clips");
    }
}
