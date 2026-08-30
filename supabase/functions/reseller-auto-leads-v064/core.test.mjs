import assert from 'node:assert/strict';
import {applySourceImage,exactDollarGeneralImageSources,exactPennyTreeUrl,enrichLead,enrichLeads,extractSourceImage} from './core.mjs';

const dg=enrichLead({retailer:'Dollar General',upc:'430001009922',source_name:'Penny Tree',source_url:'https://pennytree.org/?store=dollargeneral',signal_sources:[{name:'Penny Tree',domain:'pennytree.org',url:'https://pennytree.org/?store=dollargeneral'}]});
assert.equal(dg.source_item_url,'https://pennytree.org/item.php?sku=dg%3A430001009922');
assert.equal(dg.source_item_scope,'exact_product');
assert.equal(dg.signal_sources[0].item_url,dg.source_item_url);
const dgSources=exactDollarGeneralImageSources(dg);
assert.equal(dgSources.length,2);
assert.equal(dgSources[0].provider,'PennyTree');
assert.equal(dgSources[1].url,'https://brickseek.com/dollar-general-inventory-checker?sku=430001009922');
assert.equal(dgSources[1].scope,'exact_upc');

const dt=enrichLead({retailer:'Dollar Tree',upc:'000054643666',signal_sources:[{name:'Penny Tree',domain:'pennytree.org',url:'https://pennytree.org/?view=pennies'}]});
assert.equal(dt.source_item_url,'https://pennytree.org/item.php?sku=000054643666');

const fixture='<html><head><meta property="og:image" content="/media/products/dg/037000819196.webp"></head><body><h1>Crest toothpaste</h1></body></html>';
assert.equal(extractSourceImage(fixture,dg.source_item_url),'https://pennytree.org/media/products/dg/037000819196.webp');
const withPhoto=applySourceImage({...dg,image_url:''},fixture,dgSources[1].url,'BrickSeek');
assert.equal(withPhoto.image_url,'https://brickseek.com/media/products/dg/037000819196.webp');
assert.equal(withPhoto.image_source_provider,'BrickSeek');
assert.equal(withPhoto.image_source_scope,'exact_product');
assert.equal(withPhoto.image_source_proof,'exact_upc_public_image_v066');
assert.equal(applySourceImage({...dg,image_url:'https://cdn.example.com/real.webp'},fixture,dgSources[1].url,'BrickSeek').image_url,'https://cdn.example.com/real.webp');
assert.equal(extractSourceImage('<img src="/assets/logo.svg" alt="logo">',dg.source_item_url),'');

const fd={retailer:'Family Dollar',upc:'041364003306',signal_sources:[{name:'Penny Tree',domain:'pennytree.org'}]};
assert.equal(exactPennyTreeUrl(fd),'');
assert.deepEqual(exactDollarGeneralImageSources(fd),[]);
const unrelated={retailer:'Dollar General',upc:'430001009922',source_name:'Other Source',signal_sources:[{domain:'example.com'}]};
assert.equal(exactPennyTreeUrl(unrelated),'');
assert.equal(exactDollarGeneralImageSources(unrelated).length,1);
assert.equal(exactDollarGeneralImageSources(unrelated)[0].provider,'BrickSeek');
assert.equal(enrichLeads([dg,fd,unrelated]).length,3);
console.log('PASS reseller-auto-leads-v064 exact UPC + Dollar General image fallback fixtures');
