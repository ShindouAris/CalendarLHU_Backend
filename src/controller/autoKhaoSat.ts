import { status } from "elysia";

const BASE_URL = process.env.KHAOSAT_API
const HEADERS = (access_token: string) => {
    return {
        "Authorization": "Bearer " + access_token,
        "Content-Type": "application/json",
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
    };
}

// --- Interfaces ---
interface SurveyListItem {
    KhaoSatID: string;
    TenKhaoSat: string;
    MoTa: string;
    templateID: string;
}

interface SurveyDetail {
    KhaoSatID: string;
    TemplateID: string;
    JdataTemplate: string;
}

interface PayloadAnswer {
    QID: number;
    GID: number;
    Type: string;
    Text: string;
    Value: any;
    ValueText: string;
}

// Hàm làm sạch HTML trong mô tả để log ra màn hình cho đẹp
const cleanHtml = (html: string) => html.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();

// --- 1. HÀM LẤY DANH SÁCH KHẢO SÁT ---
async function getPendingSurveys(access_token: string): Promise<SurveyListItem[] | any> {
    console.log("[*] Đang lấy danh sách khảo sát...");
    try {
        const res = await fetch(`${BASE_URL}/NEW_User_LayDanhSachKhaoSat`, {
            method: "POST",
            headers: HEADERS(access_token)
        });

        if (!res.ok) return status("Bad Request", `Lỗi lấy danh sách: ${res.status}`);

        const json = await res.json() as { data: [SurveyListItem[], any[], any[]] };

        // data[0] là danh sách chưa làm
        const pendingList = json.data[0] || [];
        console.log(`[+] Tìm thấy ${pendingList.length} khảo sát chưa làm.`);

        return pendingList;
    } catch (e) {
        console.error("[-] Lỗi:", e);
        return [];
    }
}

// --- 2. HÀM XỬ LÝ 1 KHẢO SÁT ---
async function processSurvey(item: SurveyListItem, access_token: string, device_info: string | null): Promise<any> {
    const subjectInfo = cleanHtml(item.MoTa);
    console.log(`\n--- [] Đang xử lý: ${item.KhaoSatID} ---`);
    console.log(`    Môn: ${subjectInfo}`);

    try {
        // B1: Lấy đề bài
        // Lưu ý: Dùng ID từ danh sách để gọi API lấy đề
        const resGet = await fetch(`${BASE_URL}/auth/obj/NEW_User_KhaoSatSelectByID/${item.KhaoSatID}`, {
            method: "POST",
            headers: HEADERS(access_token)
        });

        if (!resGet.ok) return status("Bad Request", `Không lấy được đề (HTTP ${resGet.status})`);

        const jsonRes = await resGet.json() as { data: SurveyDetail };
        const data = jsonRes.data;

        if (!data) {

            return status("Bad Request", `Đề bài trống cho khảo sát ID ${item.KhaoSatID}`);
        }

        // B2: Parse đề & Spam đáp án
        const template = JSON.parse(data.JdataTemplate);
        const answers: PayloadAnswer[] = [];

        template.Part.forEach((part: any) => {
            part.Question.forEach((qGroup: any) => {
                // Trắc nghiệm bảng -> 3 (Không ý kiến)
                if (qGroup.Type === 'MarkTable' && qGroup.Topic) {
                    qGroup.Topic.forEach((topic: any) => {
                        topic.Question.forEach((q: any) => {
                            answers.push({
                                QID: q.QID,
                                GID: topic.GroupID,
                                Type: 'MarkTable',
                                Text: q.Text,
                                Value: 3,
                                ValueText: "Không ý kiến"
                            });
                        });
                    });
                }
                // Radio -> 3 (Phân vân)
                else if (qGroup.Type === 'Radio') {
                    answers.push({
                        QID: qGroup.QID,
                        GID: qGroup.QID,
                        Type: 'Radio',
                        Text: qGroup.Text,
                        Value: 3,
                        ValueText: "Phân vân"
                    });
                }
                // TextArea -> "Không có"
                else if (qGroup.Type === 'TextArea') {
                    answers.push({
                        QID: qGroup.QID,
                        GID: qGroup.QID,
                        Type: 'TextArea',
                        Text: qGroup.Text,
                        Value: "Không có",
                        ValueText: ""
                    });
                }
            });
        });


        // B3: Nộp bài
        const payload = {
            KhaoSatID: data.KhaoSatID, // Dùng ID chuẩn từ response đề bài
            TemplateID: data.TemplateID,
            CauTraLoi: answers,
            DeviceInfo: device_info || null, // đầu năm bảo là thông tin sẽ được bảo mật ai dè lấy fingerprint để so với data đăng nhập của sv =))
        };

        // Để Frontend tự nộp vì backend không cần thiết phải nộp hộ
        // const resSubmit = await fetch(`${BASE_URL}/obj/NEW_User_SubmitData`, {
        //     method: "POST",
        //     headers: HEADERS(access_token),
        //     body: JSON.stringify(payload)
        // });

        // if (resSubmit.ok) {
        //     return {success: true};
        // } else {
        //     return {success: false, errrmsg: `Lỗi nộp bài (HTTP ${resSubmit.status} - ${await resSubmit.text()})`};
        // }

        if (payload.CauTraLoi.length === 0) {
            return status("Internal Server Error", "Hệ thống xử lý khảo sát tự động không xử lý được khảo sát được")
        }

        return {
            data: payload || null
        }

    } catch (e) {
        return status("Internal Server Error")
    }
}

export const automationTool = {
    process_survey: async (access_token: string, device_info: string | null, itemKhaoSat: SurveyListItem) => {
        return await processSurvey(itemKhaoSat, access_token, device_info);
    },
    fetch_pending: async (access_token: string) => {
        return await getPendingSurveys(access_token);
    }
    // autoSuvey: async (access_token: string, device_info: string, websocket: any) => {
    //     const pendingList = await getPendingSurveys(access_token);
    //     if (pendingList.length === 0) {
    //         websocket.send(JSON.stringify({
    //             type: "survey_update",
    //             message: "Không có khảo sát nào cần làm."
    //         }));
    //         websocket.close();
    //         return;
    //     }

    //     let close = false
    //     let cancelled = false

    //     websocket.send(JSON.stringify({
    //         type: "survey_update",
    //         message: `Tìm thấy ${pendingList.length} khảo sát chưa làm. Bắt đầu xử lý...`,
    //         total: pendingList.length
    //     }))

    //     websocket.on('close', () => {
    //         console.log("[*] Kết nối WebSocket đóng, hủy quá trình tự động.");
    //         close = true
    //     })

    //     websocket.on('message', (message: string) => {
    //         try {
    //             const data = JSON.parse(message);
    //             if (data.type === 'cancel_survey') {
    //                 console.log("[*] Yêu cầu hủy từ client, dừng quá trình tự động.");
    //                 cancelled = true
    //             }

    //         } catch (e) {
    //             console.error("[-] Lỗi khi phân tích tin nhắn WebSocket:", e);
    //         }
    //     })

    //     try {
    //         for (let i = 0; i < pendingList.length; i++) {

    //             if (cancelled) {
    //                 websocket.send(JSON.stringify({
    //                   type: 'survey_stopped',
    //                   message: 'Auto survey đã bị dừng giữa chừng 🥶',
    //                   completed: i,
    //                   total: pendingList.length
    //                 }))
    //                 websocket.close()
    //                 return
    //             }

    //             if (close) {
    //                 return
    //             }

    //             const process = await processSurvey(pendingList[i], i, pendingList.length, access_token, device_info);

    //             if (process?.success) {
    //                 websocket.send(JSON.stringify({
    //                 type: 'progress_update',
    //                 current: i + 1,
    //                 total: pendingList.length
    //              }))
    //             }

    //             if (!process?.success) {
    //                 websocket.send(JSON.stringify({
    //                     type: "survey_error",
    //                     message: `Lỗi khi xử lý khảo sát ${pendingList[i].KhaoSatID}: ${process.errmsg}`
    //                 }))
    //             }

    //             if (i == pendingList.length - 1 ) {
    //                 websocket.send(JSON.stringify({
    //                     type: "survey_complete",
    //                     message: "Đã hoàn tất tất cả khảo sát."
    //                 }));
    //                 websocket.close();
    //                 break;
    //             }
    //         }
    //     } catch (error) {
    //         websocket.send(JSON.stringify({
    //             type: "survey_error",
    //             message: `Lỗi không xác định: ${error}`
    //         }))
    //         websocket.close();
    //         return;
    //     }

    // }
}
