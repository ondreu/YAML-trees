// Minimal ZIP reader supporting stored and deflated entries. Deflate is handled
// by the platform's DecompressionStream (available in Electron and modern
// mobile webviews), so there is no bundled inflate implementation.

async function inflateRaw(data: Uint8Array): Promise<Uint8Array> {
	const ds = new DecompressionStream("deflate-raw");
	const stream = new Blob([data as BlobPart]).stream().pipeThrough(ds);
	const buf = await new Response(stream).arrayBuffer();
	return new Uint8Array(buf);
}

/** Read a ZIP archive into a map of entry name -> bytes. */
export async function unzip(bytes: Uint8Array): Promise<Map<string, Uint8Array>> {
	const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
	const decoder = new TextDecoder();

	// Locate the End Of Central Directory record by scanning from the end.
	let eocd = -1;
	for (let i = bytes.length - 22; i >= 0; i--) {
		if (view.getUint32(i, true) === 0x06054b50) {
			eocd = i;
			break;
		}
	}
	if (eocd < 0) throw new Error("Not a ZIP file.");

	const count = view.getUint16(eocd + 10, true);
	let ptr = view.getUint32(eocd + 16, true); // central directory offset

	const out = new Map<string, Uint8Array>();
	for (let n = 0; n < count; n++) {
		if (view.getUint32(ptr, true) !== 0x02014b50) break;
		const method = view.getUint16(ptr + 10, true);
		const compSize = view.getUint32(ptr + 20, true);
		const nameLen = view.getUint16(ptr + 28, true);
		const extraLen = view.getUint16(ptr + 30, true);
		const commentLen = view.getUint16(ptr + 32, true);
		const localOffset = view.getUint32(ptr + 42, true);
		const name = decoder.decode(bytes.subarray(ptr + 46, ptr + 46 + nameLen));

		// Read the local header to find where the data begins.
		const lNameLen = view.getUint16(localOffset + 26, true);
		const lExtraLen = view.getUint16(localOffset + 28, true);
		const dataStart = localOffset + 30 + lNameLen + lExtraLen;
		const raw = bytes.subarray(dataStart, dataStart + compSize);

		out.set(name, method === 8 ? await inflateRaw(raw) : raw.slice());

		ptr += 46 + nameLen + extraLen + commentLen;
	}
	return out;
}
