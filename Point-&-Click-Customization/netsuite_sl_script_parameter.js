/**
 * @NApiVersion 2.1
 * @NScriptType Suitelet
 */
define(['N/search', 'N/runtime'], (search, runtime) => {

    /**
     * STEP 02: CREATE A FUNCTION WHICH LOADS EXISTING SAVED SEARCH.
     * @param {string} searchId - The ID of the saved search to load
     * @returns {search.Search} - The loaded search object
     */
    const loadSavedSearch = (searchId) => {
        if (!searchId) {
            throw new Error('Saved Search ID is missing or invalid.');
        }
        return search.load({ id: searchId });
    };

    /**
     * Core request handler for the Suitelet
     */
    const onRequest = (scriptContext) => {
        // Only handle GET requests for rendering data
        if (scriptContext.request.method === 'GET') {
            const response = scriptContext.response;

            try {
                // HARDCODED FOR STEP 2: Replace with your actual Saved Search ID (e.g., 'customsearch_my_items')
                const TARGET_SEARCH_ID = 'customsearch_customer_list'; 

                // STEP 02: THEN GET THE RECORDS FROM SAVED SEARCH ON 'onRequest' METHOD.
                const mySearch = loadSavedSearch(TARGET_SEARCH_ID);
                
                // Run the search and get up to 1000 results
                const searchResults = mySearch.run().getRange({ start: 0, end: 1000 });

                // STEP 03: THEN PUSH THE RECORDS INTO AN ARRAY
                const recordsArray = [];
                
                if (searchResults && searchResults.length > 0) {
                    searchResults.forEach((result) => {
                        const rowData = {
                            id: result.id,
                            columns: {}
                        };

                        // Dynamically pull column data so it works with any saved search structure
                        result.columns.forEach((column) => {
                            const columnName = column.name;
                            const columnJoin = column.join ? `${column.join}_` : '';
                            const finalKey = columnJoin + columnName;
                            
                            rowData.columns[finalKey] = result.getValue(column);
                        });

                        recordsArray.push(rowData);
                    });
                }

                // STEP 04: GET THE SCRIPT_PARAMETER_VALUE USING N/runtime MODULE.
                // Note: The UI prefix '_custscript' is automatically handled by NetSuite.
                const currentScript = runtime.getCurrentScript();
                const formatParameter = currentScript.getParameter({
                    name: 'custscript_sl_render_format' 
                });

                // STEP 05: THEN RENDER THE RESULT BASED ON SCRIPT_PARAMETER_VALUE
                response.header({
                    name: 'Content-Type',
                    value: 'application/json; charset=UTF-8'
                });

                if (formatParameter === 'JSON_RAW') {
                    // Render raw JSON dump
                    response.write(JSON.stringify({ 
                        format: 'RAW', 
                        totalCount: recordsArray.length, 
                        data: recordsArray 
                    }));

                } else if (formatParameter === 'JSON_CLEAN') {
                    // Render clean, simplified human-readable array format
                    const cleanData = recordsArray.map(item => ({
                        recordId: item.id,
                        details: item.columns
                    }));
                    
                    response.write(JSON.stringify({ 
                        format: 'CLEAN', 
                        totalCount: cleanData.length, 
                        data: cleanData 
                    }));

                } else {
                    // Fallback default format if parameter is empty or unhandled
                    response.write(JSON.stringify({ 
                        error: 'Configuration Error', 
                        message: `The script parameter value '${formatParameter}' is unhandled or empty.` 
                    }));
                }

            } catch (e) {
                log.error({ title: 'Suitelet Execution Error', details: e });
                scriptContext.response.write(JSON.stringify({ error: e.message }));
            }
        }
    };

    return { onRequest };
});
