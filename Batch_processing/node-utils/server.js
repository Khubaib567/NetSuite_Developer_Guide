
const express = require('express');
const Piscina = require('piscina');
const os = require('node:os');
const path = require('node:path');

const app = express();

app.use(express.json({
    limit: '10mb'
}));

// Reserve CPU capacity where possible, and cap worker count.
const availableCPUs = os.availableParallelism
    ? os.availableParallelism()
    : os.cpus().length;

const maxThreads = Math.max(
    1,
    Math.min(4, availableCPUs - 1)
);

// Create a reusable worker-thread pool.
const pool = new Piscina({
    filename: path.resolve(__dirname, 'excel-worker.js'),
    minThreads: 1,
    maxThreads,
    maxQueue: 50
});

app.post('/extract-excel', async (req, res) => {
    try {
        const { fileData } = req.body ?? {};

        if (
            typeof fileData !== 'string' ||
            !fileData.trim()
        ) {
            return res.status(400).json({
                error: 'Empty Base64 string!'
            });
        }

        // Offload CPU-intensive parsing to a worker.
        const result = await pool.run({ fileData });

        if (!result.success) {
            return res.status(result.status).json({
                error: result.error
            });
        }

        // Preserve the original API response: JSON row array.
        return res.status(200).json(result.rows);

    } catch (error) {
        console.error(
            'Excel processing request failed:',
            error.message
        );

        // Return a retryable response if the worker queue is full.
        if (error.message.includes('queue is at limit')) {
            return res.status(503).json({
                error: 'Server is busy. Please retry shortly.'
            });
        }

        return res.status(500).json({
            error: 'Server failed to process the Excel file.'
        });
    }
});

// Handle malformed JSON and oversized request bodies.
app.use((err, req, res, next) => {
    if (res.headersSent) {
        return next(err);
    }

    if (err.type === 'entity.too.large') {
        return res.status(413).json({
            error: 'Request payload exceeds the allowed size.'
        });
    }

    if (err instanceof SyntaxError && err.status === 400) {
        return res.status(400).json({
            error: 'Invalid JSON request body.'
        });
    }

    console.error('Request middleware error:', err.message);

    return res.status(500).json({
        error: 'Internal server error.'
    });
});

const server = app.listen(3000, () => {
    console.log('Excel parser running on port 3000');
    console.log(`Worker pool maximum: ${maxThreads}`);
});

// Graceful shutdown.
async function shutdown() {
    server.close();

    try {
        await pool.destroy();
    } finally {
        process.exit(0);
    }
}

process.once('SIGINT', shutdown);
process.once('SIGTERM', shutdown);
