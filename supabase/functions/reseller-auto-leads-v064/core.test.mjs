import assert from 'node:assert/strict';
import {exactPennyTreeUrl,enrichLead,enrichLeads} from './core.mjs';

const dg=enrichLead({retailer:'Dollar General',upc:'430001009922',source_name:'Penny Tree',source_url:'https://pennytree.org/?store=dollargeneral',signal_sources:[{name:'Penny Tree',domain:'pennytree.org',url:'https://pennytree.org/?store=dollargeneral'}]});
assert.equal(dg.source_item_url,'https://pennytree.org/item.php?sku=dg%3A430001009922');
assert.equal(dg.source_item_scope,'exact_product');
assert.equal(dg.signal_sources[0].item_url,dg.source_item_url);

const dt=enrichLead({retailer:'Dollar Tree',upc:'000054643666',signal_sources:[{name:'Penny Tree',domain:'pennytree.org',url:'https://pennytree.org/?view=pennies'}]});
assert.equal(dt.source_item_url,'https://pennytree.org/item.php?sku=000054643666');

const fd={retailer:'Family Dollar',upc:'041364003306',signal_sources:[{name:'Penny Tree',domain:'pennytree.org'}]};
assert.equal(exactPennyTreeUrl(fd),'');
const unrelated={retailer:'Dollar General',upc:'430001009922',source_name:'Other Source',signal_sources:[{domain:'example.com'}]};
assert.equal(exactPennyTreeUrl(unrelated),'');
assert.equal(enrichLeads([dg,fd,unrelated]).length,3);
console.log('PASS reseller-auto-leads-v064 exact source truth fixtures');
