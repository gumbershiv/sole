import { LightningElement, api, wire } from 'lwc';
import communityId from '@salesforce/community/Id';
import { publish, MessageContext } from 'lightning/messageService';
import cartChanged from '@salesforce/messageChannel/lightning__commerce_cartChanged';
import cartApi from 'commerce/cartApi';
import addToCart from '@salesforce/apex/B2BBulkProductToCartController.addToCart';
import getProductDetails from '@salesforce/apex/B2BBulkProductToCartController.getProductDetails';
import { PageLabelStoreMixin } from 'c/b2bPageLabelStoreMixin';
import { toastUtil, dataGrabber } from 'c/b2bUtil';

export default class B2BCopyPasteOrder extends PageLabelStoreMixin(LightningElement) {
    constructor() {
        super('b2bCopyPasteOrder', true);
    }

    uploadInfo = [];
    inputData = [];
    errors = [];
    effectiveAccountId;
    isLoading = false;
    showInputForm = true;
    showResultTable = false;
    valMaxProductAmount;

    @wire(MessageContext) messageContext;

    get columns() {
        return [
            { label: super.labels.labelSkuNumber, fieldName: 'sku', hideDefaultActions: true },
            { label: super.labels.labelQty, fieldName: 'qty', hideDefaultActions: true },
            {
                label: super.labels.labelNotes,
                fieldName: 'notes',
                hideDefaultActions: true,
                cellAttributes: {
                    class: { fieldName: 'notesColor' },
                    wrapText: true
                }
            }
        ];
    }

    async connectedCallback() {
        super.connectedCallback();
        this.effectiveAccountId = await dataGrabber.getEffectiveAccountId();
    }

    validateInputFormat(data) {
        this.uploadInfo = [];
        this.inputData = [];
        this.errors = [];

        if (!data) {
            this.errors.push('Input is empty.');
            return;
        }

        const rows = data.trim().split(/\r?\n/);
        const header = super.labels.csvHeaderSkuNumber.trim() + ',' + super.labels.csvHeaderQuantity.trim();
        let startIndex = rows[0].startsWith(header) ? 1 : 0;

        for (let i = startIndex; i < rows.length; i++) {
            const line = rows[i].trim();
            if (!line) continue;

            const delimiter = line.includes(',') ? ',' : line.includes('\t') ? '\t' : null;

            if (!delimiter) {
                this.errors.push(`Line ${i + 1} has no valid delimiter.`);
                continue;
            }

            const [sku, quantity] = line.split(delimiter).map(s => s.trim());

            if (!sku || isNaN(quantity) || parseInt(quantity) <= 0) {
                this.errors.push(`Line ${i + 1} has invalid format or quantity.`);
                this.inputData.push({
                    sku,
                    qty: quantity,
                    notes: 'Invalid SKU or Quantity.',
                    notesColor: 'slds-text-color_error'
                });
                continue;
            }

            this.uploadInfo.push({ sku, quantity });
        }
    }

    async validateProductAvailability() {
        const validItems = [];
        const invalidItems = [];

        try {
            const skuList = this.uploadInfo.map(item => item.sku);
            const response = await getProductDetails(skuList, null, communityId);

            if (response?.isSuccess && Array.isArray(response.data)) {
                const productMap = new Map();
                response.data.forEach(prod => productMap.set(prod.StockKeepingUnit, prod));

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

                    if (!product.B2B_IsProductSellable__c || !product.B2B_IsLatest__c) {
                        invalidItems.push({
                            sku: item.sku,
                            qty: item.quantity,
                            notes: 'Product is not sellable or outdated.',
                            notesColor: 'slds-text-color_error',
                        });
                        continue;
                    }

                    const purchaseLimit = product.Purchase_Limit__c || 9999;

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
        this.isLoading = true;
        const rawInput = this.template.querySelector('[data-id="fileUpload"]')?.value;
        this.validateInputFormat(rawInput);

        if (this.uploadInfo.length === 0) {
            this.isLoading = false;
            toastUtil.toastError(this, {
                title: super.labels.labelError,
                message: super.labels.msgNothingTodoError
            });
            return;
        }

        await this.validateProductAvailability();

        if (this.errors.length) {
            this.isLoading = false;
            toastUtil.toastError(this, {
                title: 'Validation Failed',
                message: this.errors.join(', ')
            });
            return;
        }

        const dataSet = JSON.stringify(this.uploadInfo);

        addToCart({
            data: dataSet,
            communityId: communityId,
            effectiveAccountId: this.effectiveAccountId,
            isChecked: this.template.querySelector(`[data-id="input-checkbox"]`)?.checked,
            cartItemLimit: this.valMaxProductAmount,
        })
            .then(result => {
                this.isLoading = false;

                const successData = [];
                const errorData = [];
                let showAllSuccess = true;

                if (result.isSuccess && result.data) {
                    result.data.forEach(element => {
                        const item = {
                            sku: element.sku,
                            qty: element.quantity,
                            notes: this.getMessageForCode(element.message),
                            notesColor: element.isSuccess ? 'slds-text-color_success' : 'slds-text-color_error'
                        };

                        if (element.isSuccess) {
                            successData.push(item);
                        } else {
                            errorData.push(item);
                            showAllSuccess = false;
                        }
                    });

                    this.tableData = this.inputData.concat(errorData).concat(successData);
                    this.showResultTable = true;
                    this.showInputForm = false;

                    toastUtil[showAllSuccess ? 'toastSuccess' : 'toastInfo'](this, {
                        title: showAllSuccess ? super.labels.labelSuccess : super.labels.labelPartialSuccess,
                        message: showAllSuccess ? super.labels.msgAddToCartAllSuccess : super.labels.msgAddToCartNotAllSuccess,
                    });

                    publish(this.messageContext, cartChanged);
                } else {
                    toastUtil.toastError(this, {
                        title: super.labels.labelError,
                        message: result.message || 'Unknown error occurred.'
                    });
                }
            })
            .catch(error => {
                this.isLoading = false;
                toastUtil.toastError(this, {
                    title: super.labels.labelError,
                    message: error?.body?.message || 'Unexpected error during add to cart.'
                });
            });
    }

    getMessageForCode(code) {
        switch (code) {
            case 'ITEM_SUCCESS': return super.labels.msgItemSuccess;
            case 'ERROR_INVALID_SKU': return super.labels.msgInvalidSku;
            case 'ERROR_INVALID_QUANTITY': return super.labels.msgInvalidQty;
            case 'ERROR_DUPLICATE_SKU': return super.labels.msgDuplicateSku;
            case 'ITEM_REMOVED': return super.labels.msgItemRemoved;
            case 'ERROR_QUANTITY_RULES':
                return super.labels.msgInvalidQtyRules;
            default: return code;
        }
    }

    startOver() {
        this.uploadInfo = [];
        this.inputData = [];
        this.errors = [];
        this.showInputForm = true;
        this.showResultTable = false;
    }
}
