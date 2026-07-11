/**
 * Highway 38 commercial intake form builder.
 * Controlled execution only. Running this function creates a new Google Form;
 * it does not replace or publish the current form automatically.
 *
 * Required Script Properties:
 * H38_INTAKE_RESPONSE_SHEET_ID - approved response spreadsheet ID
 *
 * Owner approval is required before running, publishing, or replacing links.
 */
function buildHighway38CommercialIntakeForm() {
  const props = PropertiesService.getScriptProperties();
  const responseSheetId = props.getProperty('H38_INTAKE_RESPONSE_SHEET_ID');
  if (!responseSheetId) throw new Error('Missing H38_INTAKE_RESPONSE_SHEET_ID Script Property.');

  const form = FormApp.create('Highway 38 Solutions — Start Request');
  form.setDescription(
    'Tell us what you would like to have when this is finished. ' +
    'No work or charge begins until scope and price are confirmed. ' +
    'Every customer-facing action remains owner reviewed.'
  );
  form.setConfirmationMessage(
    'Request received. Highway 38 will review the information, identify any missing details, ' +
    'and prepare the appropriate product or quote path. Please do not submit the same request twice.'
  );
  form.setCollectEmail(true);
  form.setProgressBar(true);
  form.setAllowResponseEdits(false);
  form.setDestination(FormApp.DestinationType.SPREADSHEET, responseSheetId);

  form.addListItem().setTitle('What would you like to have when this is finished?').setChoiceValues([
    'A clear recommendation about what to do first',
    'A layout or project plan',
    'A better shop or work process',
    'A cleaned-up business workflow',
    'A working digital workflow or tracker',
    'A manufacturing automation decision packet',
    'Help organizing files or project information',
    'I am not sure yet'
  ]).setRequired(true);
  form.addTextItem().setTitle('Name').setRequired(true);
  form.addTextItem().setTitle('Phone number — optional');
  form.addListItem().setTitle('Preferred contact method').setChoiceValues(['Email','Text','Phone only if needed']).setRequired(true);
  form.addParagraphTextItem().setTitle('What is wrong, messy, confusing, or costing time?').setRequired(true);
  form.addParagraphTextItem().setTitle('What should the finished result let you do?').setRequired(true);
  form.addParagraphTextItem().setTitle('Photos, screenshots, files, videos, or links available');
  form.addParagraphTextItem().setTitle('Measurements, process data, tools, constraints, or important details');
  form.addListItem().setTitle('Budget range').setChoiceValues(['Not sure yet','Under $250','$250–$749','$750–$1,499','$1,500–$2,499','$2,500 or more']);
  form.addListItem().setTitle('Desired timing').setChoiceValues(['Just exploring','Within two weeks','Within one month','Later or flexible']);
  form.addParagraphTextItem().setTitle('Family-specific details: describe the space/project, business workflow, digital tools/access limits, file collection, or manufacturing machine/process/part/cycle as applicable.');
  form.addCheckboxItem().setTitle('Acknowledgment').setChoiceValues([
    'I understand that scope and price must be confirmed before work begins.',
    'I will not include passwords, access tokens, or unsafe credentials in this form.'
  ]).setRequired(true);

  const result = {
    formId: form.getId(),
    editUrl: form.getEditUrl(),
    publishedUrl: form.getPublishedUrl(),
    responseSheetId: responseSheetId,
    status: 'CREATED — OWNER REVIEW REQUIRED BEFORE LINK REPLACEMENT'
  };
  Logger.log(JSON.stringify(result, null, 2));
  return result;
}
