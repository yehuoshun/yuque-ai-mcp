export declare function importDoc(params: {
    file_path: string;
    book_id?: number;
    body?: string;
    title?: string;
    skip_images?: boolean;
    upload_original?: boolean;
}): Promise<string>;
