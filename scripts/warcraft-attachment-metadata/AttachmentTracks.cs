/********************************************************************
 Copyright © 1998 - 2050 TL.lc All Rights Reserved.
 Created: 2026
 Filename: AttachmentTracks.cs
 Author: MiYu
 Descriptions: Read original ATCH visibility tracks with strict source bounds.
*********************************************************************/
using System.Text;
using Wc3ModelViewer.Core.Formats;

record SourceAttachment(int ObjectId, uint Id, string Path, MdxTrack<float>? Visibility);
static class AttachmentTracks {
    public static IReadOnlyList<SourceAttachment> Read(byte[] bytes) {
        using var r = new BinaryReader(new MemoryStream(bytes));
        void Need(long count, long end) { if (count < 0 || r.BaseStream.Position > end - count) throw new InvalidDataException("Attachment exceeds source bounds"); }
        string Text(int count) => Encoding.UTF8.GetString(r.ReadBytes(count)).Split('\0')[0];
        Need(4, bytes.Length);
        if (Text(4) != "MDLX") throw new InvalidDataException("Expected MDLX source");
        var result = new List<SourceAttachment>();
        var ids = new HashSet<int>();
        while (r.BaseStream.Position < bytes.Length) {
            Need(8, bytes.Length); string tag = Text(4); long end = r.BaseStream.Position + 4 + r.ReadUInt32();
            if (end > bytes.Length) throw new InvalidDataException("MDX chunk exceeds source bounds");
            if (tag == "ATCH") while (r.BaseStream.Position < end) {
                long start = r.BaseStream.Position; Need(4, end); long stop = start + r.ReadUInt32();
                if (stop < start + 364 || stop > end) throw new InvalidDataException("Invalid attachment size");
                long node = r.BaseStream.Position; Need(96, stop); uint nodeSize = r.ReadUInt32();
                if (nodeSize < 96 || nodeSize > stop - node - 264) throw new InvalidDataException("Invalid attachment node size");
                r.BaseStream.Position = node + 84; int objectId = r.ReadInt32();
                if (objectId < 0 || !ids.Add(objectId)) throw new InvalidDataException("Invalid or duplicate attachment object ID");
                r.BaseStream.Position = node + nodeSize;
                string path = Text(260); uint id = r.ReadUInt32(); MdxTrack<float>? track = null;
                if (r.BaseStream.Position < stop) {
                    Need(16, stop);
                    if (Text(4) != "KATV") throw new InvalidDataException("Unknown attachment track");
                    uint count = r.ReadUInt32(), mode = r.ReadUInt32(); int global = r.ReadInt32();
                    if (mode > 3 || global < -1 || count > 1000000) throw new InvalidDataException("Invalid attachment visibility header");
                    Need(count * (mode > 1 ? 16L : 8L), stop);
                    var times = new int[count]; var values = new float[count];
                    float[]? incoming = mode > 1 ? new float[count] : null, outgoing = mode > 1 ? new float[count] : null;
                    float Value() { float v = r.ReadSingle(); if (!float.IsFinite(v)) throw new InvalidDataException("Non-finite attachment visibility"); return v; }
                    for (int i = 0; i < count; i++) {
                        times[i] = r.ReadInt32(); values[i] = Value();
                        if (times[i] < 0 || i > 0 && times[i] < times[i - 1]) throw new InvalidDataException("Invalid attachment key times");
                        if (incoming is not null) { incoming[i] = Value(); outgoing![i] = Value(); }
                    }
                    track = new MdxTrack<float> { Tag = "KATV", Interpolation = (MdxInterpolation)mode, GlobalSequenceId = global, Times = times, Values = values, InTangents = incoming, OutTangents = outgoing };
                }
                if (r.BaseStream.Position != stop) throw new InvalidDataException("Unexpected attachment trailing data");
                result.Add(new SourceAttachment(objectId, id, path, track));
            }
            r.BaseStream.Position = end;
        }
        return result;
    }
}
