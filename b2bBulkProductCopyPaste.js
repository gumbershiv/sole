// LWC APIs
import { LightningElement, api, wire } from 'lwc';

// Data imports
import communityId from '@salesforce/community/Id';

// Message Channels
import { publish, MessageContext } from 'lightning/messageService';
import cartChanged from '@salesforce/messageChannel/lightning__commerce_cartChanged';

// Commerce APIs
import cartApi from 'commerce/cartApi';

// Apex code
import addToCart from '@salesforce/apex/B2BBulkProductToCartController.addToCart';

// Other LWCs
import { PageLabelStoreMixin } from 'c/b2bPageLabelStoreMixin';
import { toastUtil, dataGrabber } from 'c/b2bUtil';

export default class B2BCopyPasteOrder extends PageLabelStoreMixin(
    LightningElement
) {
    constructor() {
        super('b2bCopyPasteOrder', true);
    }

    uploadInfo = [];
    inputData = [];
    effectiveAccountId;

    isLoading = false;
    showInputForm = true;
    showResultTable = false;

    tableData = [];

    @api valMaxProductAmount;

    @wire(MessageContext)
    messageContext;

    get columns() {
        return [
            {
                hideDefaultActions: true,
                label: super.labels.labelSkuNumber,
                fieldName: 'sku',
            },
            {
                hideDefaultActions: true,
                label: super.labels.labelQty,
                fieldName: 'qty',
            },
            {
                hideDefaultActions: true,
                label: super.labels.labelNotes,
                fieldName: 'notes',
                cellAttributes: {
                    class: { fieldName: 'notesColor' },
                    wrapText: true,
                },
            },
        ];
    }

    async connectedCallback() {
        super.connectedCallback();
        this.effectiveAccountId = await dataGrabber.getEffectiveAccountId();
    }

    validateInputFormat(data) {
        debugger;
        var v = this;
        v.uploadInfo = [];
        v.errors = [];

        //var data = event.target.value;

        if (data && data.length > 0) {
            v.disabled = false;
        } else {
            v.disabled = true;
        }
        var allRows = data.split(/\r?\n/);

        var start = 0;

        let hdrString =
            super.labels.csvHeaderSkuNumber.trim() +
            ',' +
            super.labels.csvHeaderQuantity.trim();
        if (allRows[0] && allRows[0].indexOf(hdrString) == 0) {
            start = 1;
        }

        for (var singleRow = start; singleRow < allRows.length; singleRow++) {
            var rowCells = allRows[singleRow].replace('\t', ',').split(',');
            if (rowCells.length > 1) {
                let qty = rowCells[1];
                let iQty;
                try {
                    iQty = parseInt(qty);
                } catch (e) {
                    iQty = 0;
                }

                if (iQty == 0 || isNaN(iQty)) {
                    // let errors = [];
                    // errors.push(super.labels.msgUploadQtyError);
                    // item.sku = rowCells[0];
                    // item.qty = rowCells[1];
                    // item.notesColor = 'slds-text-color_error';
                    // item.notes = super.labels.msgUploadQtyError;
                    // v.inputData.push(item);
                    v.errors.push(super.labels.msgUploadQtyError);
                } else if (qty !== null && iQty > 0) {
                    v.uploadInfo.push({
                        sku: rowCells[0],
                        quantity: rowCells[1],
                    });
                }
            }
        }
    }
    
    // validateInputFormat(data){
    //     let errors = [];
    //     for(let i=0; i < data.length; i++){
    //         const {sku , qty} = data[i];
    //         if(!sku || qty){
    //             errors.push(`Line ${i + 1} is invalid. Product and Quantity are required.`);
    //         }else if (isNaN(qty) || qty<=0){
    //             errors.push(`Line ${i + 1} has invalid quantity : ${qty}. Quantity must be greater than 0.`);
    //         }
    //     }
    //     return errors;
    // }

    addToCart(event) {
        
        let successData = [];
        let errorData = [];
        console.log('dataSet',dataSet);
        //console.log('error',JSON.stringify(this.inputData));
        debugger;
        var data = this.template.querySelector('[data-id = "fileUpload"]').value;
        this.validateInputFormat(data);
        var dataSet = JSON.stringify(this.uploadInfo);
        var errors = JSON.stringify(this.errors);
        // const formatError = this.validateInputFormat(this.template.querySelector('[data-id = "fileUpload"]').value);
        // if(this.inputData.length>0){
        //     toastUtil.toastSuccess(this, {
        //         title: 'Invalid',
        //         message: 'formatError'
        //     });
        //     return;
        // }

        this.isLoading = true;

        if (this.uploadInfo.length != 0 && this.errors.length != 0) {
            addToCart({
                data: dataSet,
                communityId: communityId,
                effectiveAccountId: this.effectiveAccountId,
                isChecked: this.template.querySelector(
                    `[data-id="input-checkbox"]`
                ).checked,
                cartItemLimit: this.valMaxProductAmount,
            })
                .then((result) => {
                    let showAllSuccessMessage = true;
                    this.isLoading = false;
                    if (result.isSuccess) {
                        result.data.forEach((element) => {
                            let item = {};
                            item.sku = element.sku;
                            item.qty = element.quantity;

                            switch (element.message) {
                                case 'ITEM_SUCCESS':
                                    element.message =
                                        super.labels.msgItemSuccess;
                                    break;
                                case 'ERROR_INVALID_SKU':
                                    element.message =
                                        super.labels.msgInvalidSku;
                                    break;
                                case 'ERROR_INVALID_QUANTITY':
                                    element.message =
                                        super.labels.msgInvalidQty;
                                    break;
                                case 'ERROR_DUPLICATE_SKU':
                                    element.message =
                                        super.labels.msgDuplicateSku;
                                    break;
                                case 'ERROR_QUANTITY_RULES':
                                    let arrs = [
                                        element.minimum,
                                        element.maximum,
                                        element.increment,
                                    ];
                                    element.message = String.format(
                                        super.labels.msgInvalidQtyRules,
                                        arrs
                                    );
                                    break;
                                case 'ITEM_REMOVED':
                                    element.message =
                                        super.labels.msgItemRemoved;
                                    break;
                                default:
                                    element.message = element.message;
                            }

                            item.notes = element.message;
                            item.notesColor = element.isSuccess
                                ? 'slds-text-color_success'
                                : 'slds-text-color_error';
                            if (element.isSuccess) {
                                successData.push(item);
                            } else {
                                errorData.push(item);
                                showAllSuccessMessage = false;
                            }
                        });

                        this.tableData = this.inputData.concat(
                            errorData.concat(successData)
                        );
                        if (this.inputData.length > 0) {
                            showAllSuccessMessage = false;
                        }

                        if (showAllSuccessMessage) {
                            toastUtil.toastSuccess(this, {
                                title: super.labels.labelSuccess,
                                message: super.labels.msgAddToCartAllSuccess,
                            });
                        } else {
                            toastUtil.toastInfo(this, {
                                title: super.labels.labelPartialSuccess,
                                message: super.labels.msgAddToCartNotAllSuccess,
                            });
                        }

                        if (this.tableData.length > 0) {
                            this.showResultTable = true;
                            this.showInputForm = false;
                        }

                        publish(this.messageContext, cartChanged);
                    } else {
                        this.showResultTable = false;
                        this.showInputForm = true;
                        if ((result.message = 'ERROR_UPLOAD_LIMIT')) {
                            result.message = super.labels.msgUploadLimit;
                        }
                        toastUtil.toastError(this, {
                            title: super.labels.labelError,
                            message: result.message,
                        });
                    }
                })
                .catch((error) => {
                    this.isLoading = false;
                    let message = error && error.body && error.body.message;
                    toastUtil.toastError(this, {
                        title: super.labels.labelError,
                        message: message,
                    });
                });
        }else if(this.errors.length>0){
            toastUtil.toastSuccess(this, {
                            title: 'Invalid',
                            message: 'formatError'
                        });
        } else {
            toastUtil.toastError(this, {
                title: super.labels.labelError,
                message: super.labels.msgNothingTodoError,
            });
            this.isLoading = false;
        }
    }

    startOver() {
        this.showResultTable = false;
        this.showInputForm = true;
    }
}
