require('dotenv').config({ path: '.env.local' })
const fs = require('fs');

console.log(process.env);

if (!process.env.DEEP_SEEK_URL || !process.env.DEEP_SEEK_API_KEY){
    console.error("请设置环境变量 DEEP_SEEK_URL 和 DEEP_SEEK_API_KEY");
    process.exit(1);
}

const targetLanguages = [
    {
        "name": "zh-CN",
        "label": "简体中文",
    }
]

async function doTranslate(message, language) {
    const response = await fetch(process.env.DEEP_SEEK_URL + "/chat/completions", {
        method: "POST",
        headers: {
            "Authorization": "Bearer " + process.env.DEEP_SEEK_API_KEY,
            "Content-Type": "application/json"
        },
        body: JSON.stringify(			{
            "model": process.env.DEEP_SEEK_MODEL,
            "messages": [
                {
                    "role": "system",
                    "content": "你是一个翻译助手，你的任务是将英文文本翻译成指定的语言。请将以下英文文本翻译成" + language + "："
                },
                {
                    "role": "user",
                    "content": message
                }
            ],
						"stream": false
        }),
    });

    const data = await response.json();
		console.log(data)
    return data.choices[0].message.content
}

function putObjectValue(obj, key, value) {
    const keys = key.split('##');
    let current = obj;

    for (let i = 0; i < keys.length - 1; i++) {
        const k = keys[i];
        if (!current[k]) {
            current[k] = {};
        }
        current = current[k];
    }

    current[keys[keys.length - 1]] = value;
}

async function translate(waitTranslateList, targetObject, targetLanguage) {
    let promises = [];
    let doNum = 0;

    for (let i = 0; i < waitTranslateList.length; i++) {
        let item = waitTranslateList[i];

        promises.push(doTranslate(item.message, targetLanguage).then(mesasge => {
            console.log("翻译 key", item.key, "为", targetLanguage, ":", mesasge);
            putObjectValue(targetObject, item.key, mesasge)
        }).catch(e => {
            console.log("翻译失败", item.key, ":", e);
        }).finally(() => {
            doNum++;
            console.log("剩余翻译数量", waitTranslateList.length - doNum);
        }))

        if (promises.length > 3){
            await Promise.all(promises);
            // 睡眠1s
            await new Promise(resolve => setTimeout(resolve, 1000));

            promises = [];
        }
    }

    if (promises.length > 0){
        await Promise.all(promises);
    }
}

// 收集需要翻译的key和message
function collectMessages(sourceLanguages, targetLanguages, parentKey = '', waitTranslateList=[]){
    for (const key in sourceLanguages) {
        let currentKey = parentKey ? parentKey + "##" + key : key;
        if (sourceLanguages[key] instanceof Object) {
            collectMessages(sourceLanguages[key], targetLanguages[key] || {}, currentKey, waitTranslateList);
        } else {
            if (targetLanguages[key] === undefined) {
                waitTranslateList.push({
                    key: currentKey,
                    message: sourceLanguages[key]
                })
            }
        }
    }
}


async function run(){
    const enLanguages = require("../packages/frontend/editor-ui/src/plugins/i18n/locales/en.json")

    for (const targetLanguage of targetLanguages) {
        let targetLanguages = {};
        let fileName = `./packages/frontend/editor-ui/src/plugins/i18n/locales/${targetLanguage.name}.json`;
        if (fs.existsSync(fileName)){
            targetLanguages = JSON.parse(fs.readFileSync(fileName, "utf8"))
        }
        const waitTranslateList = []
        collectMessages(enLanguages , targetLanguages, "", waitTranslateList)
        await translate(waitTranslateList, targetLanguages, targetLanguage.label);
        // 最后使用 enLanguages的key  排序 targetLanguages key
        const sortedTargetLanguages = {};
        for (const key in enLanguages) {
            if (targetLanguages[key] !== undefined) {
                sortedTargetLanguages[key] = targetLanguages[key];
            }
        }
        // 将翻译后的语言写入文件
        fs.writeFileSync(fileName, JSON.stringify(sortedTargetLanguages, null, 4));
    }
}

run();
