import { CID } from "multiformats/cid";

export function cidToContenthash(cidString: string): `0x${string}` {
  const cid = CID.parse(cidString);
  const cidV1 = cid.toV1();
  const prefix = new Uint8Array([0xe3, 0x01]);
  const bytes = new Uint8Array(prefix.length + cidV1.bytes.length);
  bytes.set(prefix);
  bytes.set(cidV1.bytes, prefix.length);
  return ("0x" +
    Array.from(bytes)
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("")) as `0x${string}`;
}
