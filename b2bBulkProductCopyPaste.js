import { LightningElement, api, wire } from 'lwc';
import communityId from '@salesforce/community/Id';
import { publish, MessageContext } from 'lightning/messageService';
import cartChanged from '@salesforce/messageChannel/lightning__commerce_cartChanged';
import cartApi from 'commerce/cartApi';
import addToCart from '@salesforce/apex/B2BBulkProductToCartController.addToCart';
import { PageLabelStoreMixin } from 'c/b2bPageLabelStoreMixin';
import { toastUtil, dataGrabber } from 'c/b2bUtil';

export default class B2BCopyPasteOrder extends PageLabelStoreMixin(LightningElement) {
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
        const startIndex = allRows[0].trim().startsWith(expectedHeader) ? 1 : 0;

        for (let i = startIndex; i < allRows.length; i++) {
            const rawRow = allRows[i].trim();
            if (rawRow === '') break;

            const cleanedRow = rawRow.includes(',') ? rawRow : rawRow.replace(/\t/, ',');
            const columns = cleanedRow.split(',');

            const lineNumber = i + 1;

            if (columns.length !== 2) {
                this.inputData.push({
                    sku: cleanedRow,
                    qty: '',
                    notes: `Line ${lineNumber}: Invalid format. Expect 2 columns (SKU, Quantity).`,
                    notesColor: 'slds-text-color_error',
                });
                this.errors.push(`Line ${lineNumber}: Invalid format.`);
                continue;
            }

            const sku = columns[0].trim();
            const qtyStr = columns[1].trim();
            const qty = parseInt(qtyStr, 10);

            if (!sku || isNaN(qty) || qty <= 0) {
                this.inputData.push({
                    sku,
                    qty: qtyStr,
                    notes: `Line ${lineNumber}: Invalid SKU or Quantity.`,
                    notesColor: 'slds-text-color_error',
                });
                this.errors.push(`Line ${lineNumber}: Invalid data.`);
            } else {
                this.uploadInfo.push({ sku, quantity: qty });
            }
        }
    }

    async validateProductAvailability() {
        const validItems = [];
        const invalidItems = [];

        for (const item of this.uploadInfo) {
            try {
                // Replace this mock with actual Apex call if needed
                const result = await this.mockCheckProductAvailability(item.sku, item.quantity);

                if (result.isAvailable && result.isQtyValid) {
                    validItems.push(item);
                } else {
                    invalidItems.push({
                        sku: item.sku,
                        qty: item.quantity,
                        notes: result.message || 'Not available or invalid quantity.',
                        notesColor: 'slds-text-color_error',
                    });
                    this.errors.push(`SKU ${item.sku}: ${result.message}`);
                }
            } catch {
                invalidItems.push({
                    sku: item.sku,
                    qty: item.quantity,
                    notes: 'Error checking product.',
                    notesColor: 'slds-text-color_error',
                });
                this.errors.push(`SKU ${item.sku}: Availability check failed.`);
            }
        }

        this.uploadInfo = validItems;
        this.inputData = this.inputData.concat(invalidItems);
    }

    async addToCart(event) {
        const data = this.template.querySelector('[data-id="fileUpload"]').value;
        this.validateInputFormat(data);

        if (this.errors.length > 0) {
            toastUtil.toastError(this, {
                title: 'Invalid Format',
                message: 'Please correct the highlighted input issues.',
            });
            return;
        }

        await this.validateProductAvailability();

        if (this.uploadInfo.length === 0) {
            toastUtil.toastError(this, {
                title: super.labels.labelError,
                message: super.labels.msgNothingTodoError,
            });
            return;
        }

        this.isLoading = true;

        addToCart({
            data: JSON.stringify(this.uploadInfo),
            communityId: communityId,
            effectiveAccountId: this.effectiveAccountId,
            isChecked: this.template.querySelector(`[data-id="input-checkbox"]`).checked,
            cartItemLimit: this.valMaxProductAmount,
        })
            .then((result) => {
                this.isLoading = false;
                let successData = [], errorData = [], showAllSuccess = true;

                if (result.isSuccess) {
                    result.data.forEach((element) => {
                        let item = {
                            sku: element.sku,
                            qty: element.quantity,
                            notesColor: element.isSuccess ? 'slds-text-color_success' : 'slds-text-color_error',
                        };

                        switch (element.message) {
                            case 'ITEM_SUCCESS':
                                item.notes = super.labels.msgItemSuccess;
                                break;
                            case 'ERROR_INVALID_SKU':
                                item.notes = super.labels.msgInvalidSku;
                                break;
                            case 'ERROR_INVALID_QUANTITY':
                                item.notes = super.labels.msgInvalidQty;
                                break;
                            case 'ERROR_DUPLICATE_SKU':
                                item.notes = super.labels.msgDuplicateSku;
                                break;
                            case 'ERROR_QUANTITY_RULES':
                                item.notes = String.format(
                                    super.labels.msgInvalidQtyRules,
                                    [element.minimum, element.maximum, element.increment]
                                );
                                break;
                            case 'ITEM_REMOVED':
                                item.notes = super.labels.msgItemRemoved;
                                break;
                            default:
                                item.notes = element.message;
                        }

                        element.isSuccess ? successData.push(item) : errorData.push(item);
                        if (!element.isSuccess) showAllSuccess = false;
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
                        message: result.message === 'ERROR_UPLOAD_LIMIT' ? super.labels.msgUploadLimit : result.message,
                    });
                }
            })
            .catch((error) => {
                this.isLoading = false;
                toastUtil.toastError(this, {
                    title: super.labels.labelError,
                    message: error?.body?.message || 'Unknown error',
                });
            });
    }

    startOver() {
        this.uploadInfo = [];
        this.inputData = [];
        this.errors = [];
        this.showResultTable = false;
        this.showInputForm = true;
    }

    // Stub method for product validation
    mockCheckProductAvailability(sku, quantity) {
        return new Promise((resolve) => {
            // Simulate SKU lookup and quantity check
            const isAvailable = sku.startsWith('SKU');
            const isQtyValid = quantity <= 100;
            const message = !isAvailable
                ? 'SKU not found'
                : !isQtyValid
                ? 'Quantity exceeds limit'
                : '';
            resolve({ isAvailable, isQtyValid, message });
        });
    }
}
