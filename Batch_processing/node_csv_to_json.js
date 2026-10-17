const express = require('express');
const xlsx = require('xlsx');
const bodyParser = require('body-parser');

const app = express();

// Ensures Express natively processes the incoming "application/json" payload
app.use(bodyParser.json({ limit: '10mb' })); 

app.post('/extract-excel', (req, res) => {
    try {
        // Extract string from matching JSON property payload
        const excelbase64Data = req.body.fileData; 
        
        if (!excelbase64Data) {
            return res.status(400).json({ error: 'Empty base-64 string!' });
        }

        // 1. Decode the text base64 back into its original binary spreadsheet state
        const fileBuffer = Buffer.from(excelbase64Data, 'base64');

        // 2. Process bytes array natively out of memory space
        const workbook = xlsx.read(fileBuffer, { type: 'buffer' });
        const sheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[sheetName];

        // 3. Convert spreadsheet matrix to plain JSON object row arrays
        const cleanJsonRows = xlsx.utils.sheet_to_json(worksheet);

        // 4. Return results back to NetSuite
        return res.status(200).json(cleanJsonRows);

    } catch (error) {
        console.error('File Parse Processing Exception:', error);
        return res.status(500).json({ error: 'Server failed to unpack and translate file stream.' });
    }
});

app.listen(3000, () => console.log('Aligned Parser Microservice Running on Port 3000'));
