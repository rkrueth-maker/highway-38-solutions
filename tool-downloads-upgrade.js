(function(){
"use strict";

const xmlEsc=value=>String(value??"").replace(/[&<>"']/g,char=>({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&apos;"}[char]));
const htmlEsc=value=>String(value??"").replace(/[&<>"']/g,char=>({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#039;"}[char]));
const slug=name=>name.toLowerCase().replace(/[^a-z0-9]+/g,"-").replace(/^-|-$/g,"");
const parseRows=rows=>rows.map(row=>row.split(","));

function findItem(name){
  const groups=window.H38_TOOL_GROUPS||[];
  for(const [,items] of groups){
    const item=items.find(entry=>entry[0]===name);
    if(item)return item;
  }
  return null;
}

function downloadBlob(blob,filename){
  const url=URL.createObjectURL(blob);
  const link=document.createElement("a");
  link.href=url;
  link.download=filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(()=>URL.revokeObjectURL(url),1500);
}

function workbookXml(name,desc,rows){
  const parsed=parseRows(rows);
  const headers=parsed[0];
  const body=parsed.slice(1);
  const columnCount=Math.max(headers.length,1);
  const widths=headers.map((header,index)=>{
    const contentLengths=[header,...body.map(row=>row[index]||"")].map(value=>String(value).length);
    return Math.min(260,Math.max(95,Math.max(...contentLengths)*7+24));
  });
  const cells=(values,style)=>values.map(value=>`<Cell ss:StyleID="${style}"><Data ss:Type="String">${xmlEsc(value)}</Data></Cell>`).join("");
  const merged=(value,style)=>`<Cell ss:StyleID="${style}" ss:MergeAcross="${columnCount-1}"><Data ss:Type="String">${xmlEsc(value)}</Data></Cell>`;
  const bodyRows=body.map((row,rowIndex)=>`<Row ss:Height="34">${cells(headers.map((_,index)=>row[index]||""),rowIndex%2?"InputAlt":"Input")}</Row>`).join("");
  const columns=widths.map(width=>`<Column ss:AutoFitWidth="0" ss:Width="${width}"/>`).join("");
  const safeSheet=name.replace(/[\\\/?*\[\]:]/g," ").slice(0,31)||"Worksheet";

  return `<?xml version="1.0"?>
<?mso-application progid="Excel.Sheet"?>
<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet"
 xmlns:o="urn:schemas-microsoft-com:office:office"
 xmlns:x="urn:schemas-microsoft-com:office:excel"
 xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet"
 xmlns:html="http://www.w3.org/TR/REC-html40">
 <DocumentProperties xmlns="urn:schemas-microsoft-com:office:office">
  <Author>Highway 38 Solutions</Author><Company>Highway 38 Solutions</Company><Title>${xmlEsc(name)}</Title>
 </DocumentProperties>
 <ExcelWorkbook xmlns="urn:schemas-microsoft-com:office:excel"><WindowHeight>12000</WindowHeight><WindowWidth>22000</WindowWidth><ProtectStructure>False</ProtectStructure><ProtectWindows>False</ProtectWindows></ExcelWorkbook>
 <Styles>
  <Style ss:ID="Default" ss:Name="Normal"><Alignment ss:Vertical="Center" ss:WrapText="1"/><Borders/><Font ss:FontName="Arial" ss:Size="11"/><Interior/><NumberFormat/><Protection/></Style>
  <Style ss:ID="Brand"><Alignment ss:Vertical="Center"/><Font ss:FontName="Arial" ss:Size="12" ss:Bold="1" ss:Color="#FFFFFF"/><Interior ss:Color="#102A43" ss:Pattern="Solid"/></Style>
  <Style ss:ID="Title"><Alignment ss:Vertical="Center" ss:WrapText="1"/><Font ss:FontName="Arial" ss:Size="22" ss:Bold="1" ss:Color="#102A43"/><Interior ss:Color="#FFFFFF" ss:Pattern="Solid"/></Style>
  <Style ss:ID="Subtitle"><Alignment ss:Vertical="Center" ss:WrapText="1"/><Font ss:FontName="Arial" ss:Size="11" ss:Color="#536575"/><Interior ss:Color="#FFFFFF" ss:Pattern="Solid"/></Style>
  <Style ss:ID="Note"><Alignment ss:Vertical="Center" ss:WrapText="1"/><Borders><Border ss:Position="Left" ss:LineStyle="Continuous" ss:Weight="3" ss:Color="#DF5A13"/></Borders><Font ss:FontName="Arial" ss:Size="10" ss:Color="#33485A"/><Interior ss:Color="#F8EFE5" ss:Pattern="Solid"/></Style>
  <Style ss:ID="Header"><Alignment ss:Horizontal="Left" ss:Vertical="Center" ss:WrapText="1"/><Borders><Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#FFFFFF"/><Border ss:Position="Left" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#FFFFFF"/><Border ss:Position="Right" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#FFFFFF"/><Border ss:Position="Top" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#FFFFFF"/></Borders><Font ss:FontName="Arial" ss:Size="11" ss:Bold="1" ss:Color="#FFFFFF"/><Interior ss:Color="#294B68" ss:Pattern="Solid"/></Style>
  <Style ss:ID="Input"><Alignment ss:Vertical="Top" ss:WrapText="1"/><Borders><Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#B9C3CA"/><Border ss:Position="Left" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#B9C3CA"/><Border ss:Position="Right" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#B9C3CA"/><Border ss:Position="Top" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#B9C3CA"/></Borders><Font ss:FontName="Arial" ss:Size="10" ss:Color="#253746"/><Interior ss:Color="#FFFFFF" ss:Pattern="Solid"/></Style>
  <Style ss:ID="InputAlt"><Alignment ss:Vertical="Top" ss:WrapText="1"/><Borders><Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#B9C3CA"/><Border ss:Position="Left" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#B9C3CA"/><Border ss:Position="Right" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#B9C3CA"/><Border ss:Position="Top" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#B9C3CA"/></Borders><Font ss:FontName="Arial" ss:Size="10" ss:Color="#253746"/><Interior ss:Color="#F4F7F9" ss:Pattern="Solid"/></Style>
  <Style ss:ID="Footer"><Alignment ss:Vertical="Center" ss:WrapText="1"/><Font ss:FontName="Arial" ss:Size="9" ss:Italic="1" ss:Color="#667785"/><Interior ss:Color="#FFFFFF" ss:Pattern="Solid"/></Style>
 </Styles>
 <Worksheet ss:Name="${xmlEsc(safeSheet)}">
  <Table ss:ExpandedColumnCount="${columnCount}" ss:ExpandedRowCount="${body.length+8}" x:FullColumns="1" x:FullRows="1">
   ${columns}
   <Row ss:Height="28">${merged("HIGHWAY 38 SOLUTIONS  •  FINISHED WORKSHEET","Brand")}</Row>
   <Row ss:Height="38">${merged(name,"Title")}</Row>
   <Row ss:Height="34">${merged(desc,"Subtitle")}</Row>
   <Row ss:Height="30">${merged("Use this worksheet to organize facts, decisions, ownership, and next actions before work begins.","Note")}</Row>
   <Row ss:Height="10">${merged("","Subtitle")}</Row>
   <Row ss:Height="30">${cells(headers,"Header")}</Row>
   ${bodyRows}
   <Row ss:Height="32">${merged("Planning and organization aid only. Verify facts, measurements, safety, legal, tax, engineering, code, and licensed-professional requirements before acting.","Footer")}</Row>
  </Table>
  <WorksheetOptions xmlns="urn:schemas-microsoft-com:office:excel">
   <Selected/><FreezePanes/><FrozenNoSplit/><SplitHorizontal>6</SplitHorizontal><TopRowBottomPane>6</TopRowBottomPane><ActivePane>2</ActivePane>
   <ProtectObjects>False</ProtectObjects><ProtectScenarios>False</ProtectScenarios>
   <PageSetup><Layout x:Orientation="Landscape"/><Header x:Margin="0.2"/><Footer x:Margin="0.2"/><PageMargins x:Bottom="0.45" x:Left="0.35" x:Right="0.35" x:Top="0.45"/></PageSetup>
   <FitToPage/><Print><FitWidth>1</FitWidth><FitHeight>0</FitHeight><ValidPrinterInfo/></Print>
  </WorksheetOptions>
 </Worksheet>
</Workbook>`;
}

function downloadExcel(name,desc,rows){
  const xml=workbookXml(name,desc,rows);
  downloadBlob(new Blob([xml],{type:"application/vnd.ms-excel;charset=utf-8"}),`highway-38-${slug(name)}.xls`);
}

function printableHtml(name,desc,rows){
  const parsed=parseRows(rows),headers=parsed[0],body=parsed.slice(1);
  return `<!doctype html><html><head><meta charset="utf-8"><title>${htmlEsc(name)}</title><style>
  @page{size:letter landscape;margin:.38in}*{box-sizing:border-box}body{font-family:Arial,sans-serif;color:#102a43;margin:0}.brand{background:#102a43;color:#fff;font-weight:800;font-size:13px;letter-spacing:.08em;padding:12px 15px}.title{font-size:28px;font-weight:800;margin:18px 0 6px}.desc{color:#536575;margin:0 0 16px;font-size:14px}.meta{background:#f8efe5;border-left:5px solid #df5a13;padding:10px 12px;margin:0 0 16px;color:#33485a}table{border-collapse:collapse;width:100%;table-layout:fixed;font-size:11px}thead{display:table-header-group}th{background:#294b68;color:white;text-align:left;padding:9px;border:1px solid #fff}td{height:34px;padding:8px;border:1px solid #b9c3ca;vertical-align:top;word-wrap:break-word}tbody tr:nth-child(even) td{background:#f4f7f9}.footer{margin-top:14px;font-size:9px;color:#667785;font-style:italic}.no-print{position:fixed;right:12px;top:12px;background:#df5a13;color:#fff;border:0;border-radius:6px;padding:9px 13px;font-weight:700;cursor:pointer}@media print{.no-print{display:none}}
  </style></head><body><button class="no-print" onclick="window.print()">Print / Save PDF</button><div class="brand">HIGHWAY 38 SOLUTIONS • FINISHED WORKSHEET</div><div class="title">${htmlEsc(name)}</div><p class="desc">${htmlEsc(desc)}</p><div class="meta">Use this worksheet to organize facts, decisions, ownership, and next actions before work begins.</div><table><thead><tr>${headers.map(header=>`<th>${htmlEsc(header)}</th>`).join("")}</tr></thead><tbody>${body.map(row=>`<tr>${headers.map((_,index)=>`<td>${htmlEsc(row[index]||"")}</td>`).join("")}</tr>`).join("")}</tbody></table><p class="footer">Planning and organization aid only. Verify facts, measurements, safety, legal, tax, engineering, code, and licensed-professional requirements before acting.</p></body></html>`;
}

function printWithIframe(html){
  const iframe=document.createElement("iframe");
  iframe.setAttribute("aria-hidden","true");
  iframe.style.position="fixed";
  iframe.style.width="1px";
  iframe.style.height="1px";
  iframe.style.opacity="0";
  iframe.style.pointerEvents="none";
  document.body.appendChild(iframe);
  const doc=iframe.contentDocument;
  doc.open();doc.write(html);doc.close();
  setTimeout(()=>{
    try{iframe.contentWindow.focus();iframe.contentWindow.print();}
    finally{setTimeout(()=>iframe.remove(),1500);}
  },350);
}

function printPdf(name,desc,rows){
  const html=printableHtml(name,desc,rows);
  const popup=window.open("about:blank","_blank");
  if(!popup){printWithIframe(html);return;}
  popup.document.open();
  popup.document.write(html);
  popup.document.close();
  setTimeout(()=>{try{popup.focus();popup.print();}catch(error){printWithIframe(html);}},400);
}

document.addEventListener("click",event=>{
  const excel=event.target.closest("[data-excel]");
  const pdf=event.target.closest("[data-pdf]");
  if(!excel&&!pdf)return;
  const name=excel?.dataset.excel||pdf?.dataset.pdf;
  const item=findItem(name);
  if(!item)return;
  event.preventDefault();
  event.stopPropagation();
  event.stopImmediatePropagation();
  if(excel)downloadExcel(item[0],item[1],item[2]);
  else printPdf(item[0],item[1],item[2]);
},true);
})();