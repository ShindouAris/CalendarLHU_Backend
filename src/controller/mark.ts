import {load} from 'cheerio';
import { fetch } from 'bun';
import fs from "fs/promises"

interface MonHoc {
    ma_mon_hoc: string;
    ten_mon_hoc: string;
    he_so: string;
    diem_thanh_phan: string;
    diem_trung_binh: string;
}

// Mỗi học kỳ sẽ là 1 key trong object
interface HocKyGroup {
    semesters: {
        [hocKy: string]: MonHoc[];
    };
    sync_token: string | null;
}

const api_mark = process.env.API_MARK || ""

function parseSetCookie(setCookieHeader: string | null) {
    if (!setCookieHeader) return {};
  
    // Tách từng cookie (để ý dấu phẩy phân biệt cookie)
    const cookies = setCookieHeader.split(/,(?=\s*\w+=)/);
    const cookieMap: Record<string, string> = {};
  
    for (const cookie of cookies) {
      const [pair] = cookie.split(";"); // lấy phần key=value
      const [key, value] = pair.split("=");
      if (key && value) {
        cookieMap[key.trim()] = value.trim();
      }
    }
  
    return cookieMap;
  }

async function getGradesGrouped(accessToken: string, sync_token: string | undefined): Promise<HocKyGroup | null> {
    try {

        const cookies = `awt=${accessToken}${sync_token ?? `;ASP.NET_SessionId=${sync_token}`}`

        const data  = await fetch(api_mark, {
            method: "GET",
            headers: {
                'Cookie': cookies,
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
            }
        });

        const html = await data.text()

        if (!html) {
            throw new Error("No html found")
        } 

        fs.writeFile("index.html", html)

        const $ = load(html);
        const groupedGrades: HocKyGroup = {
            semesters: {},
            sync_token: null
        };
        

        $('#tblBangDiem tbody').slice(1).each((_:any, tbody:any) => {
            const semesterName = $(tbody).find('tr').first().find('td.RowGroup').text().trim();

            const courses: MonHoc[] = [];

            $(tbody).find('tr').slice(1).each((_:any, row:any) => {
                const cells = $(row).find('td');
                if (cells.length === 6) {
                    courses.push({
                        ma_mon_hoc: $(cells[0]).text().trim(),  
                        ten_mon_hoc: $(cells[1]).text().trim(),
                        he_so: $(cells[2]).text().trim(),
                        diem_thanh_phan: $(cells[3]).text().trim() || "Chưa có",
                        diem_trung_binh: $(cells[4]).text().trim() || "Chưa có",
                    });
                }
            });

            groupedGrades.semesters[semesterName] = courses;
        });

        const set_cookies = parseSetCookie(data.headers.get("set-cookie"))

        if (set_cookies) {
            groupedGrades["sync_token"] = set_cookies["ASP.NET_SessionId"]
        }

        return groupedGrades;

    } catch (err) {
        console.error("Lỗi khi lấy trang web:", err);
        return null;
    }
}

export const MarkStudent = {
    getMark: async (accessToken: string, sync_token: string | undefined) => {
        return await getGradesGrouped(accessToken, sync_token)
    }
}