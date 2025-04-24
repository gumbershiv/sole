async addToCart() {
    this.inputData = [];
    this.uploadInfo = [];
    this.errors = [];
    this.tableData = [];
    this.isLoading = true;

    const data = this.template.querySelector('[data-id="fileUpload"]').value;

    // Step 1: Format validation - Critical failure
    this.validateInputFormat(data);
    if (this.errors.length > 0) {
        this.tableData = this.inputData; // Format errors already pushed here
        this.isLoading = false;
        this.showResultTable = true;
        this.showInputForm = false;

        toastUtil.toastError(this, {
            title: super.labels.labelError,
            message: this.errors.join('\n'),
        });
        return;
    }

    // Step 2: Product availability validation - Partial failure allowed
    await this.validateProductAvailability();
    const failedItems = [...this.inputData]; // from availability check
    const validItems = [...this.uploadInfo];

    if (validItems.length === 0) {
        this.tableData = failedItems;
        this.isLoading = false;
        this.showResultTable = true;
        this.showInputForm = false;

        toastUtil.toastError(this, {
            title: super.labels.labelError,
            message: 'No valid products to add to cart.',
        });
        return;
    }

    // Step 3: Add valid items to cart
    const dataSet = JSON.stringify(validItems);

    try {
        const result = await addToCart({
            data: dataSet,
            communityId: communityId,
            effectiveAccountId: this.effectiveAccountId,
            isChecked: this.template.querySelector(`[data-id="input-checkbox"]`).checked,
            cartItemLimit: this.valMaxProductAmount,
        });

        const cartSuccess = [];
        const cartErrors = [];

        if (result.isSuccess && result.data) {
            result.data.forEach((element) => {
                let message = '';
                switch (element.message) {
                    case 'ITEM_SUCCESS':
                        message = super.labels.msgItemSuccess;
                        break;
                    case 'ERROR_INVALID_SKU':
                        message = super.labels.msgInvalidSku;
                        break;
                    case 'ERROR_INVALID_QUANTITY':
                        message = super.labels.msgInvalidQty;
                        break;
                    case 'ERROR_DUPLICATE_SKU':
                        message = super.labels.msgDuplicateSku;
                        break;
                    case 'ERROR_QUANTITY_RULES':
                        message = String.format(
                            super.labels.msgInvalidQtyRules,
                            [element.minimum, element.maximum, element.increment]
                        );
                        break;
                    case 'ITEM_REMOVED':
                        message = super.labels.msgItemRemoved;
                        break;
                    default:
                        message = element.message;
                }

                const item = {
                    sku: element.sku,
                    qty: element.quantity,
                    notes: message,
                    notesColor: element.isSuccess
                        ? 'slds-text-color_success'
                        : 'slds-text-color_error',
                };

                if (element.isSuccess) {
                    cartSuccess.push(item);
                } else {
                    cartErrors.push(item);
                }
            });

            // Step 4: Show all results in the table
            this.tableData = [...failedItems, ...cartErrors, ...cartSuccess];
            this.showResultTable = true;
            this.showInputForm = false;

            if (cartErrors.length > 0 || failedItems.length > 0) {
                toastUtil.toastInfo(this, {
                    title: super.labels.labelPartialSuccess,
                    message: super.labels.msgAddToCartNotAllSuccess,
                });
            } else {
                toastUtil.toastSuccess(this, {
                    title: super.labels.labelSuccess,
                    message: super.labels.msgAddToCartAllSuccess,
                });
            }

            publish(this.messageContext, cartChanged);
        } else {
            this.tableData = failedItems;
            this.showResultTable = true;
            this.showInputForm = false;
            toastUtil.toastError(this, {
                title: super.labels.labelError,
                message: result.message || super.labels.msgAddToCartNotAllSuccess,
            });
        }
    } catch (error) {
        this.tableData = failedItems;
        this.showResultTable = true;
        this.showInputForm = false;
        toastUtil.toastError(this, {
            title: super.labels.labelError,
            message: error?.body?.message || 'Unexpected error',
        });
    } finally {
        this.isLoading = false;
    }
}
