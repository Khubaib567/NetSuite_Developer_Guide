/**
 * @NApiVersion 2.1
 * @NScriptType Restlet
 */
define(['N/https', 'N/task', 'N/log'], (https, task, log) => {
    
    const post = async (requestBody) => {
        try {
            // 1. Ensure the incoming payload is an object containing our base64 string
            if (!requestBody || !requestBody.excelBase64Data) {
                return { status: 'Error', message: 'Payload must contain JSON key: excelBase64Data' };
            }

            // 2. Forward the structured JSON object payload safely over to your Node.js endpoint
            const nodeServiceUrl = 'https://your-node-api-endpoint.com/extract-excel';
            const response = await https.post.promise({
                url: nodeServiceUrl,
                body: JSON.stringify({ fileData: requestBody.excelBase64Data }), // Matching content and body type
                headers: { 
                    'Content-Type': 'multipart/form-data' // Explicitly JSON format
                }
            });

            if (response.code !== 200) {
                throw new Error(`Node.js microservice returned error status: ${response.code}`);
            }

            const parsedJsonRows = JSON.parse(response.body);

            // 3. Kick off Map/Reduce task run with parameter payload
            const mrTask = task.create({
                taskType: task.TaskType.MAP_REDUCE,
                scriptId: 'customscript_excel_processor_mr',
                deploymentId: 'customdeploy_excel_processor_mr',
                params: {
                    custscript_excel_json_data: JSON.stringify(parsedJsonRows)
                }
            });

            const taskId = mrTask.submit();
            return { status: 'Success', message: 'Map/Reduce script invoked successfully.', taskId: taskId };

        } catch (e) {
            log.error('RESTlet Header/Body Mismatch Error', e.toString());
            return { status: 'Error', message: e.message };
        }
    };

    return { post };
});
