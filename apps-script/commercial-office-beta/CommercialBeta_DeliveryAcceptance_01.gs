/**
 * Acceptance-scoped read-only quote/customer snapshot.
 * Avoids rebuilding every Office module when delivery acceptance only needs
 * customers, quotes and current-revision quote lines.
 */
function cbDeliveryAcceptanceSnapshot_(businessId){
  var context=cbCompletionContext_(businessId,'manageQuotes');
  var customers=cbCompletionListRows_(context,'core','customers',600);
  var quotes=cbCompletionQuoteView_(context);
  return{
    status:'PASS',
    acceptance:'DELIVERY_ACCEPTANCE_SNAPSHOT',
    businessId:context.row['Business ID'],
    customers:customers,
    quotes:quotes,
    customerCount:customers.length,
    quoteCount:quotes.length,
    readOnly:true,
    externalActionsEnabled:false,
    productionDataMigrated:false
  };
}
