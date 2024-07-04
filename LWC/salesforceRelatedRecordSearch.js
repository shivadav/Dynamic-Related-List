import { api, LightningElement, wire, track } from 'lwc';
import { getRecord, getFieldValue, updateRecord } from 'lightning/uiRecordApi';
import { getRelatedListInfo, getRelatedListRecords } from 'lightning/uiRelatedListApi';
import { NavigationMixin } from 'lightning/navigation';
import massUpdateRecords from '@salesforce/apex/SalesforceRelatedRecordSearchController.massUpdateRecords';
import { refreshApex } from '@salesforce/apex';
import { ShowToastEvent } from "lightning/platformShowToastEvent";



export default class SalesforceRelatedRecordSearch extends NavigationMixin(LightningElement) {
    @api recordId;
    @api objectApiName;
    @api childObjectApiName;
    notes;
    wiredNotesResult;
    relatedListColumns; // API response columns
    dataTableColumns; // Datatable columns
    dataTableColumnsMap;
    relatedListFields;
    updButtonDisabled = true;

    pageToken;
    currentPageToken;
    nextPageToken;

    @api iconName;
    @api pRelatedListTitle;
    relatedListTitle;
    @api pChildRelatedName;
    childRelatedName;
    @api pChildObjectApiName;
    childObjectApiName;
    @api pChildFields;
    childFields;

    fldsItemValues = [];
    updatedFields = [];
    updatedRows = [];
    searchInput;
    sel;
    openModal = false;
    @track selectedRows = [];
    @track searchedData = [];
    badWords = ['asd', 'bad', 'dog'];

    connectedCallback() {
        this.relatedListTitle = this.pRelatedListTitle;
        this.childRelatedName = this.pChildRelatedName;
        this.childObjectApiName = this.pChildObjectApiName; 
        this.childFields = this.pChildFields.split(",").map((x) => this.pChildObjectApiName + '.' + x.trim()); 
    }

    
    @wire(getRelatedListInfo, {
        parentObjectApiName: "$objectApiName",
        relatedListId: "$childRelatedName",
        optionalFields: "$childFields",
        restrictColumnsToLayout: false
    })
    wiredListInfo({ error, data }) {
        if (data) {
            this.relatedListColumns = data.displayColumns;
            //this.lookupField = data.fieldApiName;
            console.log(JSON.stringify(data, null, 2));
            // to sort the columns based on the order of fields in the pChildFields (when restrictColumnsToLayout is false, the order of fields in the relatedListColumns is not guaranteed to be the same as the order of fields in the pChildFields. Hence the sorting is necessary)
            let columnMap = {};
            this.relatedListColumns.forEach((col) => {
                columnMap[col.fieldApiName] = col;
            });
            let columns = [];
            let listOfFields = this.pChildFields.split(",").map((field) => field.trim());
            listOfFields.forEach((field) => {
                if (columnMap[field]) columns.push(columnMap[field]);
            });

            // preparing the columns for the datatable
            console.log('col data '+JSON.stringify(columns));
            this.dataTableColumns = columns.map((col) => this.prepareDatatableColumn(col));
            this.dataTableColumnsMap = {};
            this.dataTableColumns.forEach((col) => {
                this.dataTableColumnsMap[col.fieldName] = col;
            });
            this.fieldApiNames = this.relatedListColumns.map((col) => col.fieldApiName);
            this.relatedListFields = this.fieldApiNames.map((col) => this.childObjectApiName + "." + col);
        } else if (error) {
            console.error(JSON.stringify(error, null, 2));
            this.unsupportedListview = true;
        }
    }

    prepareDatatableColumn(col) {
        let x = {
            label: col.label,
            fieldName: col.fieldApiName,
            type: col.dataType,
            editable: true
        };

        if (col.dataType === "boolean") {
            x.initialWidth = 80;
        } else if (this.isUrlCol(col)) {
            x.type = "url";
            x.typeAttributes = {
                label: { fieldName: x.fieldName }
            };
            x.fieldName = col.lookupId + "_URL";
        } else if(col.dataType === "dateTime"){
            x.editable = false;
        }else if (col.dataType === "currency"){
            x.type= 'decimal';
        }
        console.log('x column '+JSON.stringify(x));
        return x;
    }

    isUrlCol(col) {
        return col.dataType === "string" && col.lookupId !== null;
    }

    isNameCol(col) {
        return col.dataType === "string" && col.lookupId === "Id";
    }

    isPicklistCol(col) {
        return col.dataType === "picklist";
    }

    prepareNote(record) {
        let note = {};
        function getLookupObjectName(column) {
            return column.fieldApiName.split(".")[0];
        }
        try {
            this.relatedListColumns.forEach(
                function (col) {
                    let field = col.fieldApiName;
                    if (this.isUrlCol(col)) {
                        note[field] = field in record.fields ? record.fields[field].value : record.fields[getLookupObjectName(col)].displayValue;
                        note[col.lookupId + "_URL"] = "/" + record.fields[getLookupObjectName(col)].value.id;
                    } else {
                        let v = record.fields[field].displayValue ? record.fields[field].displayValue : record.fields[field].value;
                        note[field] = v;
                    }
                }.bind(this)
            );
        } catch (error) {
            console.error(error);
        }
        
        note.Id = record.id;
        note.Id_URL = "/" + record.id;
        return note;
    }

    @wire(getRelatedListRecords, {
        parentRecordId: "$recordId",
        relatedListId: "$childRelatedName",
        fields: "$relatedListFields"
    })
    wiredNotes(result) {
        if (!this.relatedListFields) {
            return;
        }
        this.wiredNotesResult = result;
        const { error, data } = result;
        if (data) {
            let x = [];
            data.records.forEach((record) => {
                x.push(this.prepareNote(record));
            });            
                console.log('else not '+JSON.stringify(this.notes));
                this.notes = x;
                this.searchedData = x;
             console.log('search '+JSON.stringify(this.searchedData));
        } else if (error) {
            console.error(JSON.stringify(error));
            this.notes = [];
            this.searchedData = [];
        }
    }

     get recordCount() {
        return this.notes ? this.notes.length : 0;
    }

    get hasNotes() {
        return this.recordCount !== 0;
    }

    get showEmptyMessage() {
        return !this.hasNotes;
    }

    get showListMeta() {
        return this.recordCount > 1;
    }

    get recordCountMeta() {
        return this.nextPageToken ? this.recordCount + "+" : this.recordCount;
    }

    get relatedListTitleWithCount() {
        return this.relatedListTitle + " (" + this.recordCountMeta + ")";
    }


  updateOriginalArray(originalArray, draftArray) {
    draftArray.forEach(secondItem => {
            let row = secondItem.id.slice(4);
                for (let key in secondItem) {
                    if (key !== 'id') {
                        originalArray[row][key] = secondItem[key];
                    }
                }
    });
    }

    handleSave(event){
        event.preventDefault();
        this.fldsItemValues = event.detail.draftValues;
        console.log('Notes values'+JSON.stringify(this.notes));
        console.log('Draft values'+JSON.stringify(this.fldsItemValues));
        this.updateOriginalArray(this.searchedData, this.fldsItemValues);

        console.log('Notes values'+JSON.stringify(this.notes));
        
        this.fldsItemValues = [];
    }
    handleSearch(event) {
        this.searchTerm = event.target.value.toLowerCase(); // Convert search term to lowercase for case-insensitive search
        console.log('search term'+ this.searchTerm);
        let res = this.searchTerm.split(" ").some(value => 
                this.badWords.includes(value));
        console.log('res '+res);
        if(res){
            const event = new ShowToastEvent({
                title: 'Error!',
                variant: 'Error',
                message: 'Can not use bad words!! please enter another word to search!'
            });
            this.dispatchEvent(event);
        }
        else{
            this.searchedData = this.notes.filter(row => {
            return Object.values(row).some(value => 
                String(value).toLowerCase().includes(this.searchTerm)
            );
        });
        }
        
        console.log(this.searchedData);
        
    }

    handleRowSelection(event){
        this.sel = event.detail.selectedRows;
        console.log(this.sel.length);
        this.updButtonDisabled = this.sel.length > 0 ? false: true;
        console.log(this.updButtonDisabled);
    }

    handleUpdate(event){
        this.selectedRows = this.template.querySelector("lightning-datatable").getSelectedRows();
        console.log('1');
        console.log('selected Rows '+JSON.stringify(this.selectedRows));
            massUpdateRecords({jsonString: JSON.stringify(this.selectedRows), objectApiName: this.childObjectApiName })
            .then((result) => {
                console.log('Success');
                refreshApex(this.wiredNotesResult);
                this.selectedRows = [];
                updButtonDisabled
                this.updButtonDisabled = true;
                refreshApex(this.wiredNotesResult);
                const event = new ShowToastEvent({
                title: 'Success!',
                variant: 'Success',
                message: 'Records Updated Successfully!'
            });
            this.dispatchEvent(event);
            })
            .catch((error) => {
                console.log('Error '+JSON.stringify(error));
            });
    }
    handleMassUpdate(event){
        this.selectedRows = this.template.querySelector("lightning-datatable").getSelectedRows();
        this.openModal = true;
        console.log('open '+ this.openModal);
        console.log('352');
    }

    handleShowModal(event){
        console.log('event '+event.detail);
        this.openModal = event.detail;
        this.updButtonDisabled = true;
        refreshApex(this.wiredNotesResult);
    }

}
