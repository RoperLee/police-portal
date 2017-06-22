/**
 * Created by roper on 2017/6/22.
 */
let $ = require("jquery");
let XTemplate = require('xtemplate');
let subjectSelectTemplate = new XTemplate($('#J_subject_select_tmp').html());

$(document).ready(function () {

    getDirectoryListBySubjectId(1); //首次显示C语言
    subjectSelectTemplate.addCommand('sampleTitle', function (scope, option) {
        let title = option.params[0];
        let temp = title.replace(/计算机二级考试/g, '');
        return temp.replace(/未来教育机考/g, '');
    });
    bindEvent();

    function getDirectoryListBySubjectId(subjectId) {
        $.ajax({
            url: '/question/ajax/get/directory/list/by/subject/id',
            method: 'get',
            data: {
                subjectId: subjectId
            },
            success: function (result) {
                let html = subjectSelectTemplate.render({resultList: result.object});
                $('.subject-select-container').html(html);
            },
            error: function (error) {
                $('.subject-select-container').html({});
            }
        })
    }

    function bindEvent() {
        //科目select变化
        $('.subject-select').change(function () {
            let subjectId = $(this).children('option:selected').val();
            getDirectoryListBySubjectId(subjectId);
        });
    }
});










































