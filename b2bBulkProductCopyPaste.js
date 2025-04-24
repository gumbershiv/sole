// LWC APIs
import { LightningElement, api, wire } from 'lwc';
import { SessionContextAdapter } from 'commerce/contextApi';


// Data imports
import communityId from '@salesforce/community/Id';

// Message Channels
import { publish, MessageContext } from 'lightning/messageService';
import cartChanged from '@salesforce/messageChannel/lightning__commerce_cartChanged';

// Commerce APIs
import cartApi from 'commerce/cartApi';

// Apex code
import getProductDetails from '@salesforce/apex/B2BBulkProductToCartController.getProductDetails';
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

    // Gets or sets the effective account identifier.
    @wire(SessionContextAdapter)
    wiredSessionContext({ data, error }) {
        if (data) {
            console.log('effective AccountID: ',  data.effectiveAccountId);
            this.effectiveAccountId = data.effectiveAccountId;
        }
        else if (error) {
            console.log('error: ', error);
        }
    }

    async connectedCallback() {
        super.connectedCallback();
        //this.effectiveAccountId = await dataGrabber.getEffectiveAccountId();
        //console.log('effectiveAccountId', this.effectiveAccountId);
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

    async validateProductAvailability() {
        debugger;
        const validItems = [];
        const invalidItems = [];
        
        if(this.uploadInfo.length > 999){
            this.errors.push('Limit Exceeded');
            this.uploadInfo.forEach(item => {
                item.notes = 'Item Limit Exceeded';
                item.notesColor = 'slds-text-color_error';
            });
            return;
        }

        try {
            const skuList = this.uploadInfo.map(item => item.sku);
            console.log('skuList!@@',skuList);
            console.log('communityId!@@',communityId);
            console.log('this.effectiveAccountId!@@',this.effectiveAccountId);
            const response = await getProductDetails({
                                skus: skuList, 
                                communityId:communityId,
                                effectiveAccountId: this.effectiveAccountId});
            console.log('this.response!@@',response);
            if (response?.isSuccess && Array.isArray(response.data)) {
                const productMap = new Map();
                response.data.forEach(prod => productMap.set(prod.sku, prod));
                console.log('productMap',productMap);

                for (const item of this.uploadInfo) {
                    const product = productMap.get(item.sku);
                    const qty = parseInt(item.quantity, 10);

                    if (!product) {
                        invalidItems.push({
                            sku: item.sku,
                            qty: item.quantity,
                            notes: 'SKU not found.',
                            notesColor: 'slds-text-color_error',
                        });
                        continue;
                    }

                    const purchaseLimit = product.purchaseLimit;
                    console.log('purchaseLimit',purchaseLimit);

                    if (qty > purchaseLimit) {
                        invalidItems.push({
                            sku: item.sku,
                            qty: item.quantity,
                            notes: `Exceeds purchase limit: ${purchaseLimit}.`,
                            notesColor: 'slds-text-color_error',
                        });
                        continue;
                    }

                    validItems.push(item);
                }

                this.uploadInfo = validItems;
                this.inputData = this.inputData.concat(invalidItems);

                if (invalidItems.length) {
                    this.errors.push('Some products are invalid or exceed purchase limits.');
                }
            } else {
                this.errors.push('Product validation failed.');
            }
        } catch (error) {
            console.error('Validation error:', error);
            this.errors.push('Error validating products.');
        }
    }

    async addToCart() {
        let successData = [];
        let errorData = [];

        const data = this.template.querySelector('[data-id = "fileUpload"]').value;
        this.validateInputFormat(data);

        await this.validateProductAvailability();
        // if (this.errors.length) {
        //     this.isLoading = false;
        //     toastUtil.toastError(this, {
        //         title: 'Validation Failed',
        //         message: this.errors.join(', ')
        //     });
        //     return;
        // }

        const dataSet = JSON.stringify(this.uploadInfo);
        const 

        this.isLoading = true;

        if (this.uploadInfo.length > 0 && this.errors.length === 0) {
            addToCart({
                data: dataSet,
                communityId: communityId,
                effectiveAccountId: this.effectiveAccountId,
                isChecked: this.template.querySelector(`[data-id="input-checkbox"]`).checked,
                cartItemLimit: this.valMaxProductAmount,
            })
                .then((result) => {
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

                        publish(this.messageContext, cartChanged);
                    } else {
                        this.showResultTable = false;
                        this.showInputForm = true;
                        if (result.message === 'ERROR_UPLOAD_LIMIT') {
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
                    const message = error?.body?.message || 'Unexpected error';
                    toastUtil.toastError(this, {
                        title: super.labels.labelError,
                        message,
                    });
                });
        } else if (this.errors.length > 0) {
            this.isLoading = false;
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
