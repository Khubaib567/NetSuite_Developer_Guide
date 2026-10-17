
const xlsx = require('xlsx');

const MAX_FILE_BYTES = 7 * 1024 * 1024;
const MAX_BASE64_CHARS = Math.ceil(MAX_FILE_BYTES / 3) * 4;

module.exports = function processExcel({ fileData }) {
    try {
        // Validate the incoming payload.
        if (
            typeof fileData !== 'string' ||
            fileData.length === 0
        ) {
            return {
                success: false,
                status: 400,
                error: 'Empty Base64 string!'
            };
        }

        // Reject oversized or malformed Base64 input.
        if (
            fileData.length > MAX_BASE64_CHARS ||
            fileData.length % 4 !== 0 ||
            !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(fileData)
        ) {
            return {
                success: false,
                status: 400,
                error: 'Invalid Base64 data or file exceeds the size limit.'
            };
        }

        // Decode Base64 into binary data.
        const fileBuffer = Buffer.from(fileData, 'base64');

        if (
            fileBuffer.length === 0 ||
            fileBuffer.length > MAX_FILE_BYTES
        ) {
            return {
                success: false,
                status: 400,
                error: 'Empty file or file exceeds the size limit.'
            };
        }

        // Parse the Excel workbook inside this worker.
        const workbook = xlsx.read(fileBuffer, {
            type: 'buffer'
        });

        const sheetName = workbook.SheetNames[0];

        if (!sheetName || !workbook.Sheets[sheetName]) {
            return {
                success: false,
                status: 422,
                error: 'No readable worksheet found.'
            };
        }

        const worksheet = workbook.Sheets[sheetName];

        // Convert worksheet rows to JSON.
        const cleanJsonRows = xlsx.utils.sheet_to_json(
            worksheet
        );

        return {
            success: true,
            rows: cleanJsonRows
        };

    } catch (error) {
        // Avoid exposing internal parser errors to API clients.
        return {
            success: false,
            status: 422,
            error: 'Failed to parse the Excel workbook.'
        };
    }
};
