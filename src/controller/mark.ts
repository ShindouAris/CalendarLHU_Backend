import {load} from 'cheerio';
import { fetch } from 'bun';
// import fs from 'fs';  // debug
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
    reason?: string;
}

const api_mark = process.env.API_MARK || ""

async function getGradesGrouped(accessToken: string): Promise<HocKyGroup | null> {
    try {

        const groupedGrades: HocKyGroup = {
            semesters: {},
            tin_chi_tich_luy: 0,
        };
        groupedGrades.reason = "Phiên bản LHU Dashboard của bạn đã cũ, hãy cập nhật lên phiên bản mới"
        groupedGrades.semesters = {};
        groupedGrades.tin_chi_tich_luy = 0
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