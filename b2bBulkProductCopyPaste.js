// LWC APIs
import { LightningElement, api, track } from 'lwc';

// Data imports
import communityId from '@salesforce/community/Id';

// Commerce APIs
import {refreshCartSummary} from 'commerce/cartApi';

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
    errors = [];

    tableData = [];
    @track showFormatError = false;

    @api valMaxProductAmount;

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
    }

    validateInputFormat(data) {
        debugger;
        this.uploadInfo = [];
        this.inputData = [];
        this.errors = [];

        if (!data || data.trim().length === 0) {
            this.errors.push(super.labels.msgNothingTodoError);
            return;
        }

        const allRows = data.split(/\r?\n/);
        const expectedHeader =
            super.labels.csvHeaderSkuNumber.trim() + ',' + super.labels.csvHeaderQuantity.trim();
        const start = allRows[0].startsWith(expectedHeader) ? 1 : 0;

        for (let i = start; i < allRows.length; i++) {
            const rawRow = allRows[i].trim();
            if(rawRow === ''){
                break;
            }
            const cleanedRow = rawRow.includes(',') ?rawRow : rawRow.replace('\t', ',');
            const columns = cleanedRow.split(',');

            const lineNumber = i + 1;

            if (columns.length !== 2) {
                this.inputData.push({
                    sku: rawRow,
                    qty: '',
                    notes: `Line ${lineNumber}: Format invalid. Expected 2 columns (SKU, Quantity).`,
                    notesColor: 'slds-text-color_error',
                });
                this.errors.push(`Line ${lineNumber}: Incorrect format.`);
                continue;
            }

            const sku = columns[0].trim();
            const qty = parseInt(columns[1].trim(), 10);

            if (!sku || isNaN(qty) || qty <= 0) {
                this.inputData.push({
                    sku,
                    qty: columns[1].trim(),
                    notes: `Line ${lineNumber}: Invalid SKU or quantity.`,
                    notesColor: 'slds-text-color_error',
                });
                this.errors.push(`Line ${lineNumber}: Invalid data.`);
            } else {
                this.uploadInfo.push({ sku, quantity: qty });
            }
        }
    }

    async addToCart() {
        let successData = [];
        let errorData = [];

        const data = this.template.querySelector('[data-id = "fileUpload"]').value;
        this.validateInputFormat(data);

        const dataSet = JSON.stringify(this.uploadInfo);
        this.effectiveAccountId = await dataGrabber.getEffectiveAccountId();
        this.isLoading = true;

        if (this.uploadInfo.length > 0 && this.errors.length === 0) {

            await addToCart({
                data: dataSet,
                communityId: communityId,
                effectiveAccountId: this.effectiveAccountId,
                isChecked: this.template.querySelector(`[data-id="input-checkbox"]`).checked,
                cartItemLimit: this.valMaxProductAmount,
            })
            
                .then((result) => {
                    console.log('result',result);
                    let showAllSuccessMessage = true;
                    this.isLoading = false;

                    if (result.isSuccess) {
                        result.data.forEach((element) => {
                            let item = {
                                sku: element.sku,
                                qty: element.quantity,
                            };

                            switch (element.message) {
                                case 'ITEM_SUCCESS':
                                    element.message = super.labels.msgItemSuccess;
                                    break;
                                case 'ERROR_INVALID_SKU':
                                    element.message = super.labels.msgInvalidSku;
                                    break;
                                case 'ERROR_INVALID_QUANTITY':
                                    element.message = super.labels.msgInvalidQty;
                                    break;
                                case 'ERROR_DUPLICATE_SKU':
                                    element.message = super.labels.msgDuplicateSku;
                                    break;
                                case 'ERROR_QUANTITY_RULES':
                                    element.message = 'Invalid Quanitity';
                                    element.message = String.format(
                                        super.labels.msgInvalidQtyRules,
                                        [element.minimum, element.maximum, element.increment]
                                    );
                                    break;
                                case 'ITEM_REMOVED':
                                    element.message = super.labels.msgItemRemoved;
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

                        this.tableData = this.inputData.concat(errorData, successData);

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

                        this.showResultTable = true;
                        this.showInputForm = false;

                        refreshCartSummary()
                        .then(() => {
                            console.log('Success');
                        });
                        
                    } else {
                        this.showResultTable = false;
                        this.showInputForm = true;
                        if (result.message = 'ERROR_UPLOAD_LIMIT') {
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
        } else if (this.errors.length > 0) {
            showFormatError = true;
            this.isLoading = false;
            const displayError = this.errors.join('\n')
            toastUtil.toastError(this, {
                title: super.labels.labelError,
                message: this.errors.join('\n'),
            });
        } else {
            this.isLoading = false;
            toastUtil.toastError(this, {
                title: super.labels.labelError,
                message: super.labels.msgNothingTodoError,
            });
        }
    }

    startOver() {
        this.showResultTable = false;
        this.showInputForm = true;
        
    }
}
