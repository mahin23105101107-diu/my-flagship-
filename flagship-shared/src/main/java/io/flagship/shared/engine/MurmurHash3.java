package io.flagship.shared.engine;

import java.nio.charset.StandardCharsets;

/**
 * Strategy / Deterministic Hashing Utility:
 * MurmurHash3 32-bit x86 matching the TypeScript evaluation core bit-for-bit.
 */
public final class MurmurHash3 {
    private static final int SEED = 0x9747b28c;

    private MurmurHash3() {}

    public static long hash32Unsigned(String input) {
        byte[] data = input.getBytes(StandardCharsets.UTF_8);
        int len = data.length;
        int h1 = SEED;
        final int c1 = 0xcc9e2d51;
        final int c2 = 0x1b873593;
        int nblocks = len >> 2;

        for (int i = 0; i < nblocks; i++) {
            int i4 = i * 4;
            int k1 = (data[i4] & 0xff)
                | ((data[i4 + 1] & 0xff) << 8)
                | ((data[i4 + 2] & 0xff) << 16)
                | ((data[i4 + 3] & 0xff) << 24);
            k1 *= c1;
            k1 = Integer.rotateLeft(k1, 15);
            k1 *= c2;

            h1 ^= k1;
            h1 = Integer.rotateLeft(h1, 13);
            h1 = h1 * 5 + 0xe6546b64;
        }

        int k1 = 0;
        int tail = nblocks * 4;
        switch (len & 3) {
            case 3:
                k1 ^= (data[tail + 2] & 0xff) << 16;
            case 2:
                k1 ^= (data[tail + 1] & 0xff) << 8;
            case 1:
                k1 ^= (data[tail] & 0xff);
                k1 *= c1;
                k1 = Integer.rotateLeft(k1, 15);
                k1 *= c2;
                h1 ^= k1;
            default:
                break;
        }

        h1 ^= len;
        h1 ^= (h1 >>> 16);
        h1 *= 0x85ebca6b;
        h1 ^= (h1 >>> 13);
        h1 *= 0xc2b2ae35;
        h1 ^= (h1 >>> 16);

        return Integer.toUnsignedLong(h1);
    }

    public static double computeBucket(String flagKey, String userKey) {
        long hash = hash32Unsigned(flagKey + ":" + userKey);
        return (hash % 10_000L) / 100.0;
    }
}
