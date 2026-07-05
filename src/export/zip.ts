// Minimal ZIP archive writer using the "store" method (no compression). Enough
// to package the handful of XML parts an .xlsx file needs, with no dependency.
// The same algorithm is inlined into the HTML export so it can build .xlsx in
// the browser too.

export interface ZipEntry {
	name: string;
	data: Uint8Array;
}

const CRC_TABLE = (() => {
	const table = new Uint32Array(256);
	for (let n = 0; n < 256; n++) {
		let c = n;
		for (let k = 0; k < 8; k++) {
			c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
		}
		table[n] = c >>> 0;
	}
	return table;
})();

function crc32(bytes: Uint8Array): number {
	let crc = 0xffffffff;
	for (let i = 0; i < bytes.length; i++) {
		crc = CRC_TABLE[(crc ^ bytes[i]) & 0xff] ^ (crc >>> 8);
	}
	return (crc ^ 0xffffffff) >>> 0;
}

export function utf8(text: string): Uint8Array {
	return new TextEncoder().encode(text);
}

/** Build a ZIP archive (store method) from the given entries. */
export function makeZip(entries: ZipEntry[]): Uint8Array {
	const chunks: Uint8Array[] = [];
	const central: Uint8Array[] = [];
	let offset = 0;

	for (const entry of entries) {
		const nameBytes = utf8(entry.name);
		const crc = crc32(entry.data);
		const size = entry.data.length;

		const local = new Uint8Array(30 + nameBytes.length);
		const lv = new DataView(local.buffer);
		lv.setUint32(0, 0x04034b50, true); // local file header signature
		lv.setUint16(4, 20, true); // version needed
		lv.setUint16(6, 0, true); // flags
		lv.setUint16(8, 0, true); // method: store
		lv.setUint16(10, 0, true); // mod time
		lv.setUint16(12, 0, true); // mod date
		lv.setUint32(14, crc, true);
		lv.setUint32(18, size, true); // compressed size
		lv.setUint32(22, size, true); // uncompressed size
		lv.setUint16(26, nameBytes.length, true);
		lv.setUint16(28, 0, true); // extra length
		local.set(nameBytes, 30);

		chunks.push(local, entry.data);

		const cd = new Uint8Array(46 + nameBytes.length);
		const cv = new DataView(cd.buffer);
		cv.setUint32(0, 0x02014b50, true); // central directory signature
		cv.setUint16(4, 20, true); // version made by
		cv.setUint16(6, 20, true); // version needed
		cv.setUint16(8, 0, true);
		cv.setUint16(10, 0, true);
		cv.setUint16(12, 0, true);
		cv.setUint16(14, 0, true);
		cv.setUint32(16, crc, true);
		cv.setUint32(20, size, true);
		cv.setUint32(24, size, true);
		cv.setUint16(28, nameBytes.length, true);
		cv.setUint16(30, 0, true);
		cv.setUint16(32, 0, true);
		cv.setUint16(34, 0, true);
		cv.setUint16(36, 0, true);
		cv.setUint32(38, 0, true);
		cv.setUint32(42, offset, true);
		cd.set(nameBytes, 46);
		central.push(cd);

		offset += local.length + entry.data.length;
	}

	const centralSize = central.reduce((n, c) => n + c.length, 0);
	const end = new Uint8Array(22);
	const ev = new DataView(end.buffer);
	ev.setUint32(0, 0x06054b50, true); // end of central directory
	ev.setUint16(8, entries.length, true);
	ev.setUint16(10, entries.length, true);
	ev.setUint32(12, centralSize, true);
	ev.setUint32(16, offset, true);

	const total =
		offset + centralSize + end.length;
	const out = new Uint8Array(total);
	let p = 0;
	for (const c of chunks) {
		out.set(c, p);
		p += c.length;
	}
	for (const c of central) {
		out.set(c, p);
		p += c.length;
	}
	out.set(end, p);
	return out;
}
