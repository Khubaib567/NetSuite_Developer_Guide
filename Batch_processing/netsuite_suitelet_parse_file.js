/**
 * @NApiVersion 2.1
 * @NScriptType Suitelet
 */
define(['N/https', 'N/task', 'N/log'], (https, task, log) => {
    
    const onRequest = async (context) => {


        // HARDCODED SECURE KEY (Or manage via a custom record / configuration file)
        const SECRET_AUTH_TOKEN = 'your-super-secure-custom-api-token-12345';

        // Enforce that this logic only triggers on incoming POST requests
        if (context.request.method !== 'POST') {
            context.response.setHeader({ name: 'Content-Type', value: 'text/plain' });
            context.response.write('This Suitelet endpoint only accepts POST requests.');
            return;
        }

        try {

            // 1. EXTRA SECURITY: Validate the inbound authorization token
            // Note: NetSuite request header keys are converted to lowercase
            const incomingToken = context.request.headers['x-custom-auth-token'];

            if (!incomingToken || incomingToken !== SECRET_AUTH_TOKEN) {
                context.response.setHeader({ name: 'Content-Type', value: 'application/json' });
                context.response.write(JSON.stringify({ 
                    status: 'Error', 
                    message: 'Authentication failed. Invalid or missing X-Custom-Auth-Token header.' 
                }));
                return;
            }

            // 1. Suitelets capture form-data files via context.request.files
            const requestFiles = context.request.files;
            
            if (!requestFiles || !requestFiles['excelFile']) {
                context.response.setHeader({ name: 'Content-Type', value: 'application/json' });
                context.response.write(JSON.stringify({ 
                    status: 'Error', 
                    message: 'Please upload the file through form-data Payload using the key "excelFile"!' 
                }));
                return;
            }

            const excelFile = requestFiles['excelFile'];

            // Convert into base64 string
            const excelbase64Data = excelFile.getContents();

            // 2. Forward the structured JSON object payload safely over to your Node.js endpoint
            const nodeServiceUrl = 'https://your-node-api-endpoint.com/extract-excel';
            const response = await https.post.promise({
                url: nodeServiceUrl,
                body: JSON.stringify({ fileData: excelbase64Data }), // Matching content and body type
                headers: { 
                    'Content-Type': 'application/json' // Explicitly JSON format
                }
            });

            if (response.code !== 200) {
                throw new Error(`Node.js microservice returned error status: ${response.code}`);
            }

            const parsedJsonRows = JSON.parse(response.body);

            // 3. Kick off Map/Reduce task run with parameter payload
            const mrTask = task.create({
                taskType: task.TasTkype.MAP_REDUCE,
                scriptId: 'customscript_excel_processor_mr',
                deploymentId: 'customdeploy_excel_processor_mr',
                params: {
                    custscript_excel_json_data: JSON.stringify(parsedJsonRows)
                }
            });

            const taskId = mrTask.submit();
            
            // Send back successful response status to Postman/client
            context.response.setHeader({ name: 'Content-Type', value: 'application/json' });
            context.response.write(JSON.stringify({ 
                status: 'Success', 
                message: 'Map/Reduce script invoked successfully.', 
                taskId: taskId 
            }));

        } catch (e) {
            log.error('Suitelet Execution Error', e.toString());
            
            context.response.setHeader({ name: 'Content-Type', value: 'application/json' });
            context.response.write(JSON.stringify({ 
                status: 'Error', 
                message: e.message 
            }));
        }
    };

    return { onRequest };
});
