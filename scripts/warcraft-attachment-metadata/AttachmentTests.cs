/********************************************************************
 Copyright © 1998 - 2050 TL.lc All Rights Reserved.
 Created: 2026
 Filename: AttachmentTests.cs
 Author: MiYu
 Descriptions: Exercise attachment track boundaries and malformed-source rejection.
*********************************************************************/
using System.Text;

static class AttachmentTests {
    static byte[] Fixture(uint mode) {
        using var stream = new MemoryStream(); using var w = new BinaryWriter(stream);
        w.Write(Encoding.ASCII.GetBytes("MDLXATCH")); uint length = 364 + 16 + 2 * (mode > 1 ? 16u : 8u); w.Write(length);
        w.Write(length); w.Write(96u); w.Write(new byte[80]); w.Write(2); w.Write(-1); w.Write(0u);
        w.Write(new byte[260]); w.Write(7u); w.Write(Encoding.ASCII.GetBytes("KATV")); w.Write(2u); w.Write(mode); w.Write(-1);
        foreach (int time in new[] { 0, 100 }) { w.Write(time); w.Write(time == 0 ? 0f : 1f); if (mode > 1) { w.Write(.25f); w.Write(.75f); } }
        return stream.ToArray();
    }
    public static void Run() {
        int checks = 0;
        void Reject(byte[] bytes) { try { AttachmentTracks.Read(bytes); } catch (InvalidDataException) { checks++; return; } throw new Exception("Malformed attachment accepted"); }
        for (uint mode = 0; mode < 4; mode++) {
            var bytes = Fixture(mode); var a = AttachmentTracks.Read(bytes).Single();
            if (a.ObjectId != 2 || a.Id != 7 || a.Visibility?.Count != 2 || (uint)a.Visibility.Interpolation != mode || a.Visibility.Values[1] != 1) throw new Exception("Attachment changed");
            checks++;
            for (int size = 0; size < bytes.Length; size++) if (size != 4) Reject(bytes[..size]);
        }
        var invalid = Fixture(0); BitConverter.GetBytes(95u).CopyTo(invalid, 16); Reject(invalid);
        invalid = Fixture(0); BitConverter.GetBytes(4u).CopyTo(invalid, 384); Reject(invalid);
        invalid = Fixture(0); BitConverter.GetBytes(float.NaN).CopyTo(invalid, 396); Reject(invalid);
        invalid = Fixture(0); BitConverter.GetBytes(-1).CopyTo(invalid, 392); Reject(invalid);
        invalid = Fixture(0); invalid[376] = (byte)'X'; Reject(invalid);
        var plain = Fixture(0)[..376]; BitConverter.GetBytes(364u).CopyTo(plain, 8); BitConverter.GetBytes(364u).CopyTo(plain, 12);
        if (AttachmentTracks.Read(plain).Single().Visibility is not null) throw new Exception("Missing track must keep rest visibility"); checks++;
        Console.WriteLine($"PASS attachment parser: {checks} checks");
    }
}
