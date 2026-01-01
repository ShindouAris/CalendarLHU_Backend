export interface UserResponse {
    UserID: string;
    UserName: string;
    LastName: string;
    FirstName: string;
    DepartmentID: string;
    Email: string;
    EmailReceived: boolean;
    MessagePermission: number;
    FriendPermission: number;
    GroupID: number;
    Avatar: string;
    isAuth: boolean;
    FullName: string;
    GroupName: string;
    Class: string;
    DepartmentName: string;
  }

export interface UserInfoResponse {
    data: UserResponse;
}

export interface UserDataForAIUsage {
    UserID: string;
    isAuth: boolean;
    FullName: string;
    GroupName: string;
    Class: string;
}