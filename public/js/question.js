/**
 * Created by roper on 2017/6/22.
 */
var XTemplate = require('xtemplate');
var subjectSelectTemplate = new XTemplate($('#J_subject_select_tmp').html());

$(document).ready(function () {
    var html = subjectSelectTemplate.render({fullName: 'Roper'});
    $('.subject-select-container').html(html);
});