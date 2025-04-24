async validateProductAvailability() {
    const validItems = [];
    const invalidItems = [];

    if (this.uploadInfo.length > 999) {
        this.errors.push('Limit Exceeded');
        this.uploadInfo.forEach(item => {
            item.notes = 'Item Limit Exceeded';
            item.notesColor = 'slds-text-color_error';
        });
        return;
    }

    try {
        const skuList = this.uploadInfo.map(item => item.sku);
        const response = await getProductDetails({
            skus: skuList,
            communityId: communityId,
            effectiveAccountId: this.effectiveAccountId
        });

        if (response?.isSuccess && Array.isArray(response.data)) {
            const productMap = new Map();
            response.data.forEach(prod => productMap.set(prod.sku, prod));

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

    if (this.errors.length) {
        this.isLoading = false;
        toastUtil.toastError(this, {
            title: 'Validation Failed',
            message: this.errors.join(', ')
        });
        return;
    }

    const dataSet = JSON.stringify(this.uploadInfo);
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

                    // Include the invalid items from product availability validation in the table
                    this.tableData = this.inputData.concat(errorData, successData);

                    // If there are no errors, show all success message
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
