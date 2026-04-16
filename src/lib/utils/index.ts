export function downloadTextFile(content: string, filename: string) {
    const blob = new Blob([content], { type: "text/csv" });
    const url = URL.createObjectURL(blob);

    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();

    URL.revokeObjectURL(url);
}

/**
 * Splits CSV text into rows, preserving the newline separator at the end of each row
 * except for the final row. RFC 4180-compliant, supports newlines inside quotes.
 *
 * @param csvText - The full CSV string
 * @returns Array of CSV rows (with newline at end if present)
 */
export function splitCsvRowsKeepNewline(csvText: string): string[] {
    const rows: string[] = [];
    const regex = /(?:(?:"(?:[^"]|"")*"|[^\r\n])*)(?:\r\n|\n)?/g;

    let match: RegExpExecArray | null;
    let lastIndex = 0;

    while ((match = regex.exec(csvText)) !== null) {
        const row = match[0];
        if (row === "") break; // end of string

        rows.push(row);
        lastIndex = regex.lastIndex;
    }

    // Handle any remaining text after last match (EOF without newline)
    if (lastIndex < csvText.length) {
        rows.push(csvText.slice(lastIndex));
    }

    return rows;
}

/**
 * Parses a single CSV row into an array of fields (RFC 4180-compliant)
 * Handles quoted fields, commas, newlines, and escaped quotes.
 *
 * @param row - The CSV row as a string
 * @param delimiter - The field delimiter (default: comma)
 * @returns Array of string values
 */
export function parseCsvRow(row: string, delimiter: string = ","): string[] {
    const result: string[] = [];
    let field = "";
    let inQuotes = false;

    for (let i = 0; i < row.length; i++) {
        const char = row[i];

        if (char === '"') {
            if (inQuotes && row[i + 1] === '"') {
                // Escaped quote
                field += '"';
                i++; // Skip the second quote
            } else {
                // Toggle inQuotes
                inQuotes = !inQuotes;
            }
        } else if (char === delimiter && !inQuotes) {
            // End of field
            result.push(field);
            field = "";
        } else if ((char === "\r" || char === "\n") && !inQuotes) {
            // End of row (ignore newlines inside quoted fields)
            continue;
        } else {
            field += char;
        }
    }

    // Push the last field
    result.push(field);

    return result;
}
