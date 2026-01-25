import mongoose, { Schema, Document } from "mongoose";

export interface IUser extends Document {
    UserID: string;
    FullName: string;
    Class: string;
    DepartmentName: string;
    createdAt: Date;
    updatedAt: Date;
}

const UserSchema: Schema = new Schema({
    UserID: { type: String, required: true, unique: true },
    FullName: { type: String, required: true },
    Class: { type: String },
    DepartmentName: { type: String },
}, {
    timestamps: true
});

export const UserModel = mongoose.model<IUser>("User", UserSchema);
