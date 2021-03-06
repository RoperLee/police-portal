/**
 * Created by roper on 2017/6/22.
 */
let $ = require("jquery");
let XTemplate = require('xtemplate');
let subjectSelectTemplate = new XTemplate($('#J_subject_select_tmp').html());
let selectOptionTemplate = new XTemplate($('#J_select_option_tmp').html());
let selectItemData = {
    A: 'B', B: 'C', C: 'D', D: 'E', E: 'F', F: 'G', G: 'H', H: 'I', I: 'J', J: 'K'
};

$(document).ready(function () {

    getDirectoryListBySubjectId(1); //首次显示C语言
    bindEvent();//绑定事件
    subjectSelectTemplate.addCommand('sampleTitle', function (scope, option) {
        let title = option.params[0];
        let temp = title.replace(/计算机二级考试/g, '');
        return temp.replace(/未来教育机考/g, '');
    });

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
        //重新打开图片选的时候，清空当前的fileStack
        $('.btn-file').on('click', function () {
            $(this).find('input').fileinput('clearStack');
        });
        //题目类型select变化 —— 选择、填空、操作题
        $('.issue-type-select').change(function () {
            let issuetype = $(this).children('option:selected').val();
            if (issuetype === 'CHOICE') {
                $('.choice-info-panel').removeClass('hidden');
            } else {
                $('.choice-info-panel').addClass('hidden');
            }
        });
        //减少选项
        $('.min-select').on('click', function () {
            if ($('.select-option-container').find('.input-group').length > 1) {
                $('.select-option-container').find('.input-group').last().remove();
                $('.correct-select').find('option').last().remove();
            }
        });
        //增加选项
        $('.add-select').on('click', function () {
            let currentItemVal = $('.select-option-container').find('input').last().data('value');
            if (selectItemData[currentItemVal]) {
                $('.select-option-container').append(selectOptionTemplate.render({item: selectItemData[currentItemVal]}));
                $('.correct-select').append('<option value="' + selectItemData[currentItemVal] + '"' + '>' + selectItemData[currentItemVal] + '</option>');
            }
        });
        //科目select变化
        $('.subject-select').change(function () {
            let subjectId = $(this).children('option:selected').val();
            getDirectoryListBySubjectId(subjectId);
        });
        //题号加1
        $('.add-number-btn').on('click', function (e) {
            let origin = $('.sort-key-number').val().replace(/\s/g, "");
            if (origin.length == 0) {
                origin = '0';
            }
            $('.sort-key-number').val(parseInt(origin) + 1);
        });
        //题号减1
        $('.min-number-btn').on('click', function (e) {
            let origin = $('.sort-key-number').val().replace(/\s/g, "");
            if (origin.length == 0) {
                origin = '1';
            }
            $('.sort-key-number').val(parseInt(origin) - 1);
        });
        //支持Tab缩进
        $(".question-content-text,.answer-content-text").on('keydown', function (e) {
            if (e.keyCode == 9) {
                e.preventDefault();
                let indent = '    ';
                let start = this.selectionStart;
                let end = this.selectionEnd;
                let selected = window.getSelection().toString();
                selected = indent + selected.replace(/\n/g, '\n' + indent);
                this.value = this.value.substring(0, start) + selected
                    + this.value.substring(end);
                this.setSelectionRange(start + indent.length, start
                    + selected.length);
            }
        });
        //解析是否是图片
        $('input[name="is-img-answer"]').change(function () {
            var $selectedvalue = $('input[name="is-img-answer"]:checked').val();
            if ($selectedvalue == 'N') {
                $('.answer-content-text').removeClass('hidden');
                $('.up-answer-file-container').addClass('hidden');
            } else {
                $('.answer-content-text').addClass('hidden');
                $('.up-answer-file-container').removeClass('hidden');
            }
        });
        //题目是否是图片
        $('input[name="is-img-content"]').change(function () {
            let $selectedvalue = $('input[name="is-img-content"]:checked').val();
            if ($selectedvalue == 'N') {
                $('.question-content-text').removeClass('hidden');
                $('.up-file-container').addClass('hidden');
            } else {
                $('.question-content-text').addClass('hidden');
                $('.up-file-container').removeClass('hidden');
            }
        });
        //选项否是图片
        $('input[name="is-img-select"]').change(function () {
            var $selectedvalue = $('input[name="is-img-select"]:checked').val();
            if ($selectedvalue == 'N') {
                $('.select-text-panel').removeClass('hidden');
                $('.select-image-panel').addClass('hidden');
            } else {
                $('.select-text-panel').addClass('hidden');
                $('.select-image-panel').removeClass('hidden');
            }
        });

    }

});










































