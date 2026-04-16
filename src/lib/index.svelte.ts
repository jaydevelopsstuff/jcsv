import { SvelteMap, SvelteSet } from "svelte/reactivity";
import { parseCsvRow, splitCsvRowsKeepNewline } from "./utils";

const CHUNK_SIZE = 1024 * 512; // 0.5MiB

export class DataEngine {
    dataSource: CSVFile;

    // Key is column id
    columnTransformPipelines: SvelteMap<string, ColumnTransformPipeline>;
    rowTransformPipeline: RowTransformPipeline;

    addedRows: SvelteMap<number, Row[]>;
    deletedRows: SvelteSet<number>;

    // K: Row ID, V: (K: Col Header ID, V: Cell Value)
    preTransformEdits: SvelteMap<string, SvelteMap<string, string>>;
    // postTransformEdits: SvelteMap<string, SvelteMap<string, string>>;

    rowCount: number;

    constructor(csv: CSVFile) {
        this.dataSource = csv;
        this.columnTransformPipelines = new SvelteMap();
        this.rowTransformPipeline = { pipeline: [] };

        this.addedRows = new SvelteMap();
        this.deletedRows = new SvelteSet();

        this.rowCount = $derived(
            this.dataSource.rowCount -
                this.deletedRows.size +
                this.addedRows
                    .entries()
                    .reduce((acc, [_k, v]) => acc + v.length, 0),
        );

        this.preTransformEdits = new SvelteMap();
        // this.postTransformEdits = new SvelteMap();
    }

    async init() {
        await this.dataSource.buildIndex();
        // this.addedRows.set(2, [
        //     {
        //         id: "addedRow:dsflkj",
        //         columns: [
        //             ...this.dataSource.columnHeaders.keys().map((hId, i) => ({
        //                 headerId: hId,
        //                 value: i.toString(),
        //             })),
        //         ],
        //     },
        //     {
        //         id: "addedRow:sdfsd",
        //         columns: [
        //             ...this.dataSource.columnHeaders.keys().map((hId, i) => ({
        //                 headerId: hId,
        //                 value: i.toString(),
        //             })),
        //         ],
        //     },
        // ]);
    }

    async getProcessedRows(start: number, end: number) {
        return (await this.getRows(start, end)).map((row, rIdx) => {
            const trueRowIdx = rIdx + start;
            row.columns = row.columns.map((col) => {
                let value = col.value;

                const preTransformEdit = this.preTransformEdits
                    .get(row.id)
                    ?.get(col.headerId);
                if (preTransformEdit) value = preTransformEdit;

                for (const transform of this.columnTransformPipelines.get(
                    col.headerId,
                )?.pipeline ?? []) {
                    value = transform.fn(value, trueRowIdx);
                }

                // const postTransformEdit = this.postTransformEdits
                //     .get(row.id)
                //     ?.get(col.headerId);
                // if (postTransformEdit) value = postTransformEdit;

                col.value = value;

                return col;
            });
            return row;
        });
    }

    addColumnTransformToPipeline(columnId: string, code: string) {
        const pipeline = this.columnTransformPipelines.get(columnId) ?? {
            pipeline: [],
        };
        pipeline.pipeline.push({ code, fn: compileColumnTransform(code) });
        this.columnTransformPipelines.set(columnId, pipeline);
    }

    addEdit(
        rowId: string,
        colHeaderId: string,
        position: "pre" | "post",
        editValue: string,
    ) {
        if (rowId.startsWith("addedRow:")) {
            const entry = this.addedRows
                .entries()
                .find(([k, v]) => v.some((r) => r.id === rowId));
            if (!entry) return;

            const [k, v] = entry;
            const row = v.find((r) => r.id === rowId)!;
            row.columns[
                row.columns.findIndex((c) => c.headerId === colHeaderId)
            ].value = editValue;
            this.addedRows.set(k, v);
            return;
        }

        const map = this.preTransformEdits;
        const colMap = map.get(rowId) ?? new SvelteMap();

        colMap.set(colHeaderId, editValue);
        map.set(rowId, colMap);
    }

    /**
     * Adds a row after the provided row, or at the very beginning if no row id (`null`) is provided.
     * @param rowId The id of the row that the new row should be added after. If this row cannot be found, no action will be taken.
     * @returns The new row's id, or null if the provided row could not be found.
     */
    addRowAfter(rowId: string | null): string | null {
        const newRow: Row = {
            id: `addedRow:${window.crypto.randomUUID()}`,
            columns: [
                ...this.dataSource.columnHeaders.keys().map((headerId) => ({
                    headerId,
                    value: "",
                })),
            ],
        };
        if (rowId === null) {
            this.addedRows.set(0, [newRow, ...(this.addedRows.get(0) ?? [])]);
            return newRow.id;
        }

        if (rowId.startsWith("row:")) {
            const rawIndex = parseInt(rowId.substring(4));

            this.addedRows.set(rawIndex, [
                ...(this.addedRows.get(0) ?? []),
                newRow,
            ]);
        } else if (rowId.startsWith("addedRow:")) {
            const entry = this.addedRows
                .entries()
                .find(([k, v]) => v.some((r) => r.id === rowId));
            if (!entry) return null;
            const [k, rows] = entry;
            const innerIndex = rows.findIndex((r) => r.id === rowId)!;
            rows.splice(innerIndex, 0, newRow);
            this.addedRows.set(k, rows);
        } else return null;

        return newRow.id;
    }

    deleteRow(rowId: string) {
        // Original Row from CSV
        if (rowId.startsWith("row:"))
            this.deletedRows.add(parseInt(rowId.substring(4)));
        // Row that was added by user
        else if (rowId.startsWith("addRow:")) {
            const entry = this.addedRows
                .entries()
                .find(([_k, v]) => v.some((r) => r.id === rowId));
            if (!entry) return;

            this.addedRows.set(
                entry[0],
                entry[1].filter((r) => r.id !== rowId),
            );
        }
    }

    async exportWithChanges() {
        return [
            [...this.dataSource.columnHeaders.values()].join(","),
            ...(await this.getProcessedRows(0, this.dataSource.rowCount!)).map(
                (row) => row.columns.map((c) => `"${c.value}"`).join(","),
            ),
        ].join("\n");
    }

    async getRows(start: number, end: number) {
        let rows = await this.dataSource.getRows(
            this.computedIndexToRaw(start),
            this.computedIndexToRaw(end),
        );
        this.addedRows.forEach((r, k) => {
            rows.splice(k, 0, ...r);
        });
        rows = rows.filter(
            (r) => !this.deletedRows.has(parseInt(r.id.substring(4))),
        );
        return rows;
    }

    getComputedRowIndex(rowId: string) {
        if (rowId.startsWith("row:")) {
            return this.rawIndexToComputed(parseInt(rowId.substring(4)));
        } else if (rowId.startsWith("addedRow:")) {
            const entry = this.addedRows
                .entries()
                .find(([k, v]) => v.some((r) => r.id === rowId));
            if (!entry) return null;
            const [anchorIndex, rows] = entry;

            let rawIndex = anchorIndex + rows.findIndex((r) => r.id === rowId);
            return this.rawIndexToComputed(rawIndex);
        }
        return null;
    }

    rawIndexToComputed(rawIdx: number) {
        let computedIdx = rawIdx;

        // Subtract # of deleted rows before this one from index
        computedIdx -= this.deletedRows
            .keys()
            .reduce((acc, cV) => (cV < rawIdx ? acc + 1 : acc), 0);
        // Add # of new rows before this one to index
        computedIdx += this.addedRows
            .entries()
            .reduce(
                (acc, [cvK, cvV]) => (cvK < rawIdx ? acc + cvV.length : acc),
                0,
            );

        return computedIdx;
    }
    computedIndexToRaw(computedIdx: number) {
        let rawIdx = computedIdx;

        // Add # of deleted rows before this one to index
        computedIdx += this.deletedRows
            .keys()
            .reduce((acc, cV) => (cV < rawIdx ? acc + 1 : acc), 0);
        // Subtract # of new rows before this one from index
        computedIdx -= this.addedRows
            .entries()
            .reduce(
                (acc, [cvK, cvV]) => (cvK < rawIdx ? acc + cvV.length : acc),
                0,
            );

        return (
            this.addedRows.entries().find(([k, v]) => {
                return computedIdx >= k && computedIdx < k + v.length;
            })?.[0] ?? computedIdx
        );
    }
}

type ColumnTransformPipeline = {
    pipeline: ColumnTranform[];
};

type RowTransformPipeline = {
    pipeline: RowTransform[];
};

/**
 * A class for lazy-loading csv rows from (potentially) large files.
 */
export class CSVFile {
    file: File;
    // Key: row #, Value: byte offset
    rowIndices: Map<number, number>;
    indexInterval: number;
    rowCount: number;
    // Key: column id, Value: column name
    columnHeaders: Map<string, string>;

    constructor(file: File, indexInterval = 1000) {
        this.file = file;
        this.rowIndices = new Map();
        this.indexInterval = indexInterval;
        this.rowCount = 0;
        this.columnHeaders = new Map();
    }

    /**
     * Builds an index of the byte offsets for every `this.indexInterval`th row.
     */
    async buildIndex() {
        const encoder = new TextEncoder();
        const decoder = new TextDecoder("UTF-8");

        let offset = 0;
        let rowCount = 0;
        let leftover = "";

        while (offset < this.file.size) {
            const slice = this.file.slice(offset, offset + CHUNK_SIZE);
            const text = decoder.decode(await slice.arrayBuffer(), {
                stream: true,
            });
            const combined = leftover + text;
            const rows = splitCsvRowsKeepNewline(combined);

            if (offset + CHUNK_SIZE < this.file.size)
                leftover = rows.pop() || "";

            for (let row of rows) {
                if (rowCount % this.indexInterval === 0) {
                    this.rowIndices.set(rowCount, offset);
                }
                rowCount++;
                offset += encoder.encode(row).length;
            }
        }

        this.rowCount = rowCount - 1; // We don't include the header
        this.columnHeaders = new Map(
            (await this.getRowsRaw(0, 1))[0].map((header) => [
                window.crypto.randomUUID(),
                header,
            ]),
        );
    }

    async getRows(start: number, end: number): Promise<Row[]> {
        return (await this.getRowsRaw(start + 1, end + 1)).map((cols, ri) => ({
            id: `row:${start + ri - 1}`,
            columns: cols.map((col, ci) => ({
                headerId: [...this.columnHeaders.keys()][ci],
                value: col,
            })),
        }));
    }

    async getRowsRaw(start: number, end: number): Promise<string[][]> {
        if (start > end) throw "Start index cannot be greater than end index";
        if (end === start) return [];
        let rowCounter =
            Math.floor(start / this.indexInterval) * this.indexInterval;
        const startOffset = this.rowIndices.get(rowCounter);
        if (startOffset === undefined)
            throw "Start row index is greater than csv's total number of rows";

        const decoder = new TextDecoder();
        let offset = startOffset;
        let leftover = "";
        const rows: string[][] = [];

        while (offset < this.file.size && rowCounter < end) {
            const slice = this.file.slice(offset, offset + CHUNK_SIZE);
            const text = decoder.decode(await slice.arrayBuffer(), {
                stream: true,
            });
            const combined = leftover + text;
            const parsedRows = splitCsvRowsKeepNewline(combined);

            if (offset + CHUNK_SIZE < this.file.size)
                leftover = parsedRows.pop() || "";

            for (let row of parsedRows) {
                if (rowCounter >= start && rowCounter < end) {
                    rows.push(parseCsvRow(row));
                }
                rowCounter++;
            }
            offset += CHUNK_SIZE;
        }

        return rows;
    }
}

export type Row = {
    id: string;
    columns: Column[];
};

export type Column = {
    headerId: string;
    value: string;
};

type ColumnTranform = {
    code: string;
    fn: (columnValue: string, rowIndex: number) => string;
};

type RowTransform = {
    code: string;
    fn: (
        inputRow: Record<string, string>,
        rowIndex: number,
    ) => Record<string, string>;
};

function compileColumnTransform(
    code: string,
): (columnValue: string, rowIndex: number) => string {
    // @ts-ignore
    return new Function(
        "columnValue",
        "rowIndex",
        `"use strict"; return (${code})(columnValue, rowIndex)`,
    );
}
