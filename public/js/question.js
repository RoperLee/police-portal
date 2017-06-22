/**
 * Created by roper on 2017/6/22.
 */
var XTemplate = require('xtemplate');

$(document).ready(function () {
    var subjectSelectTemplate = new XTemplate('J_subject_select_tmp');
    $('.subject-select-container').html(subjectSelectTemplate.render({
        id: 12,
        fullName: 'Roper'
    }));

});