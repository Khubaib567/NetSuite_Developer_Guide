/**
 * @NApiVersion 2.1
 * @NScriptType UserEventScript
 * @NModuleScope SameAccount
 */
define(['N/record', 'N/search', 'N/log'], (record, search, log) => {

    const afterSubmit = (scriptContext) => {
        if (scriptContext.type !== scriptContext.UserEventType.CREATE && 
            scriptContext.type !== scriptContext.UserEventType.EDIT) return;

        try {
            const newRecord = scriptContext.newRecord;

            // 1. Grab the active segment value from the transaction saving
            const baseSegmentValue = newRecord.getValue({ fieldId: 'custbody_my_custom_segment' });

            if (!baseSegmentValue) {
                log.debug('Exit', 'No custom segment found on the active record.');
                return;
            }

            // 2. Wrap parentSegment logic into an object containing its hasChild check
            let parentSegment = {
                currentId: baseSegmentValue,
                // Lookahead exception check: returns true if a child relationship exists in the DB
                hasChild: function() {
                    return checkChildRecordExistence(this.currentId);
                }
            };

            log.audit('Process Start', `Initiating lookup loop for base segment: ${parentSegment.currentId}`);

            // 3. Loop Paradigm using your exact parentSegment.hasChild() condition
            while (parentSegment.hasChild()) {
                
                // Get the data of the existing child record mapped to this segment level
                const childData = getChildRecordDetails(parentSegment.currentId);
                
                if (!childData) break; // Extra safety if metadata search hits an unexpected null

                log.debug('Processing Level', `Loading parent record to update child ID: ${childData.childRecordId}`);

                // 4. Load the Parent Record
                // (e.g., if processing Invoice -> Bill Payment, this loads the Invoice)
                const parentRecord = record.load({
                    type: childData.parentRecordType,
                    id: childData.parentRecordId,
                    isDynamic: true
                });

                // 5. Update the Child Link field on the loaded parent record
                // Replace 'custbody_linked_child_ref' with the field ID tracking the child relationship
                parentRecord.setValue({
                    fieldId: 'custbody_linked_child_ref', 
                    value: childData.childRecordId
                });

                // Commit the parent record changes back to NetSuite
                const savedParentId = parentRecord.save({
                    enableSourcing: false,
                    ignoreMandatoryFields: true
                });

                log.audit('Parent Updated', `Successfully updated Parent [${childData.parentRecordType}] ID: ${savedParentId} with Child ID: ${childData.childRecordId}`);

                // 6. Transition the loop to the child segment to descend down the next layer
                parentSegment.currentId = childData.childSegmentId;
            }

            log.audit('Process End', 'Hierarchy iteration complete. No further child elements exist.');

        } catch (e) {
            log.error('Exception in Loop Process', e.toString());
        }
    };

    /**
     * Lookahead function validating if the current segment maps to an existing child record structure
     */
    const checkChildRecordExistence = (segmentId) => {
        // Queries your segment layout map to see if a downstream child segment entry exists
        const lookaheadSearch = search.create({
            type: 'customrecord_segment_hierarchy_map',
            filters: [['custrecord_parent_segment_field', search.Operator.ANYOF, segmentId]],
            columns: ['custrecord_child_segment_field']
        });

        const results = lookaheadSearch.run().getRange({ start: 0, end: 1 });
        return (results && results.length > 0);
    };

    /**
     * Grabs existing transaction IDs & record types tied to the current parent/child segment boundaries
     */
    const getChildRecordDetails = (parentSegmentId) => {
        // 1. Find the next segment down the list
        const mapSearch = search.create({
            type: 'customrecord_segment_hierarchy_map',
            filters: [['custrecord_parent_segment_field', search.Operator.ANYOF, parentSegmentId]],
            columns: ['custrecord_child_segment_field', 'custrecord_parent_rec_type', 'custrecord_child_rec_type']
        });

        const mapResult = mapSearch.run().getRange({ start: 0, end: 1 });
        if (!mapResult || mapResult.length === 0) return null;

        const childSegmentId = mapResult[0].getValue({ name: 'custrecord_child_segment_field' });
        const parentType = mapResult[0].getValue({ name: 'custrecord_parent_rec_type' });
        const childType = mapResult[0].getValue({ name: 'custrecord_child_rec_type' });

        // 2. Use the segments to pull the existing Transaction IDs from the database
        const parentTxId = findTransactionBySegment(parentType, parentSegmentId);
        const childTxId = findTransactionBySegment(childType, childSegmentId);

        if (!parentTxId || !childTxId) {
            log.debug('Skipping Chain Level', `Missing active transaction instance for Type: ${parentType} or ${childType}`);
            return null;
        }

        return {
            parentRecordType: parentType,
            parentRecordId: parentTxId,
            childRecordId: childTxId,
            childSegmentId: childSegmentId
        };
    };

    /**
     * Helper to find a specific transaction instance based on its record type and assigned custom segment
     */
    const findTransactionBySegment = (recType, segmentValue) => {
        const txSearch = search.create({
            type: recType,
            filters: [
                ['custbody_my_custom_segment', search.Operator.ANYOF, segmentValue],
                'AND',
                ['mainline', 'is', 'T']
            ],
            columns: ['internalid']
        });
        const res = txSearch.run().getRange({ start: 0, end: 1 });
        return (res && res.length > 0) ? res[0].getValue({ name: 'internalid' }) : null;
    };

    return { afterSubmit };
});
