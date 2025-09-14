import {load} from 'cheerio';
import { fetch } from 'bun';

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
    tin_chi_tich_luy: number
}

const api_mark = process.env.API_MARK || ""

async function getGradesGrouped(accessToken: string): Promise<HocKyGroup | null> {
    try {

        const cookies = `awt=${accessToken}`

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

        const $ = load(html);
        const groupedGrades: HocKyGroup = {
            semesters: {},
            tin_chi_tich_luy: 0,
        };
        
        let so_tin_chi_tich_luy: number = 0

        $('#tblBangDiem tbody').slice(1).each((_:any, tbody:any) => {
            const semesterName = $(tbody).find('tr').first().find('td.RowGroup').text().trim().replace("Học kỳ ", "");

            const courses: MonHoc[] = [];

            $(tbody).find('tr').slice(1).each((_:any, row:any) => {
                const cells = $(row).find('td');
                if (cells.length === 6) {
                    courses.push({
                        ma_mon_hoc: $(cells[0]).text().trim(),  
                        ten_mon_hoc: $(cells[1]).text().trim(),
                        he_so: $(cells[2]).text().trim(), // -> tín chỉ / học kì
                        diem_thanh_phan: $(cells[3]).text().trim() || "Chưa có",
                        diem_trung_binh: $(cells[4]).text().trim() || "Chưa có",
                    });
                    so_tin_chi_tich_luy += Number($(cells[2]).text().trim()) || 0
                }
            });

            groupedGrades.semesters[semesterName] = courses;
        });

        groupedGrades.tin_chi_tich_luy = so_tin_chi_tich_luy

        return groupedGrades;

    } catch (err) {
        console.error("Lỗi khi lấy trang web:", err);
        return null;
    }
}

export const MarkStudent = {
    getMark: async (accessToken: string) => {
        return await getGradesGrouped(accessToken)
    }
}