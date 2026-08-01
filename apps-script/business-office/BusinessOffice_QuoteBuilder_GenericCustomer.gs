/** System-owned placeholder customer for photo-first estimates. */

function boQuoteBuilderEnsureGenericCustomer() {
  return boSafeExecute_('Ensure generic quote customer', function () {
    const access = boQuoteBuilderRequireAction_('Create');
    boQuoteBuilderRequireAction_('customers');
    const customerId = 'CUST-H38-GENERIC-QUOTE';
    const displayName = 'Generic Quote Customer';
    const rows = boReadTable_(H38_BO_SHEETS.CUSTOMERS, { includeVoided: true });
    let customer = rows.find(function (row) {
      return row['Customer ID'] === customerId || boNormalizeText_(row['Display Name']).toLowerCase() === displayName.toLowerCase();
    });
    if (customer && customer.Status !== 'Voided') {
      if (customer.Status !== 'Active' || customer['Customer ID'] !== customerId) {
        customer = boUpdateRecord_(H38_BO_SHEETS.CUSTOMERS, customer['Customer ID'], {
          'Display Name': displayName,
          'Customer Type': 'Internal Placeholder',
          'Payment Terms': customer['Payment Terms'] || 'Net 15',
          'Tax Status': 'Review Required',
          Tags: 'Generic Quote; Photo-First Estimate; Replace Before Send',
          Status: 'Active',
          'Attention Status': 'None',
          Notes: 'System placeholder for photo-first estimates. Replace with the real customer before approval or sending.'
        }, 'Restore generic quote customer');
      }
      boQuoteBuilderInvalidateCache_('customers');
      return { customerId: customer['Customer ID'], displayName: displayName, created: false };
    }
    customer = boAppendRecord_(H38_BO_SHEETS.CUSTOMERS, {
      'Customer ID': customerId,
      'Customer Number': 'C-GENERIC-QUOTE',
      'Display Name': displayName,
      'Customer Type': 'Internal Placeholder',
      'Primary Contact ID': '',
      Email: boGetActiveEmail_() || '',
      Phone: '',
      'Billing Address ID': '',
      'Service Address ID': '',
      'Payment Terms': 'Net 15',
      'Tax Status': 'Review Required',
      Tags: 'Generic Quote; Photo-First Estimate; Replace Before Send',
      Status: 'Active',
      'Attention Status': 'None',
      Notes: 'System placeholder for photo-first estimates. Replace with the real customer before approval or sending.'
    }, 'Create generic quote customer');
    boQuoteBuilderInvalidateCache_('customers');
    boProof_('ENSURE GENERIC QUOTE CUSTOMER', 'Customer', customerId, 'PASS', 'Photo-first placeholder ready', access.user.email);
    return { customerId: customerId, displayName: displayName, created: true };
  }, 'Customer', 'CUST-H38-GENERIC-QUOTE');
}
