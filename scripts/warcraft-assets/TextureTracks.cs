/********************************************************************
 Copyright © 1998 - 2050 TL.lc All Rights Reserved.
 Created: 2026
 Filename: TextureTracks.cs
 Author: MiYu
 Descriptions: Read classic TXAN tracks and sample UV transforms with the MDX animator.
*********************************************************************/
using System.Numerics;
using Wc3ModelViewer.Core.Formats;

static class TextureTracks {
    public static MdxAnimator Read(byte[] bytes, MdxModel source) {
        var model = new MdxModel();
        model.GlobalSequences.AddRange(source.GlobalSequences);
        using var reader = new BinaryReader(new MemoryStream(bytes));
        reader.BaseStream.Position = 4;
        while (reader.BaseStream.Position < bytes.Length) {
            string chunk = new string(reader.ReadChars(4));
            long end = reader.BaseStream.Position + 4 + reader.ReadUInt32();
            if (end > bytes.Length) throw new InvalidDataException("MDX chunk exceeds source");
            if (chunk == "TXAN") while (reader.BaseStream.Position < end) {
                long start = reader.BaseStream.Position;
                long itemEnd = start + reader.ReadUInt32();
                if (itemEnd < start + 4 || itemEnd > end) throw new InvalidDataException("Invalid TXAN size");
                MdxTrack<Vector3>? translation = null, scale = null;
                MdxTrack<Quaternion>? rotation = null;
                while (reader.BaseStream.Position < itemEnd) {
                    string tag = new string(reader.ReadChars(4));
                    if (tag == "KTAT") translation = Track(reader, tag, () => new Vector3(reader.ReadSingle(), reader.ReadSingle(), reader.ReadSingle()));
                    else if (tag == "KTAS") scale = Track(reader, tag, () => new Vector3(reader.ReadSingle(), reader.ReadSingle(), reader.ReadSingle()));
                    else if (tag == "KTAR") rotation = Track(reader, tag, () => new Quaternion(reader.ReadSingle(), reader.ReadSingle(), reader.ReadSingle(), reader.ReadSingle()));
                    else throw new InvalidDataException($"Unknown TXAN track {tag}");
                }
                if (reader.BaseStream.Position != itemEnd) throw new InvalidDataException("TXAN track exceeds animation");
                int id = model.Nodes.Count;
                model.Nodes.Add(new MdxNode { Name = $"UV {id}", ObjectId = id, Pivot = new Vector3(.5f, .5f, 0), Translation = translation, Rotation = rotation, Scale = scale });
            }
            reader.BaseStream.Position = end;
        }
        return new MdxAnimator(model);
    }

    static MdxTrack<T> Track<T>(BinaryReader reader, string tag, Func<T> value) {
        int count = checked((int)reader.ReadUInt32());
        var interpolation = (MdxInterpolation)reader.ReadUInt32();
        int global = reader.ReadInt32();
        if (count > 1000000 || (uint)interpolation > 3) throw new InvalidDataException("Invalid TXAN track header");
        int[] times = new int[count];
        T[] values = new T[count];
        T[]? incoming = (uint)interpolation > 1 ? new T[count] : null;
        T[]? outgoing = incoming is null ? null : new T[count];
        for (int i = 0; i < count; i++) {
            times[i] = reader.ReadInt32(); values[i] = value();
            if (incoming is not null) { incoming[i] = value(); outgoing![i] = value(); }
        }
        return new MdxTrack<T> { Tag = tag, Interpolation = interpolation, GlobalSequenceId = global, Times = times, Values = values, InTangents = incoming, OutTangents = outgoing };
    }
}
