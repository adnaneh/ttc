export interface A_DocumentInfoRecordAttch {
  DocumentInfoRecordDocType: string;
  DocumentInfoRecordDocNumber: string;
  DocumentInfoRecordDocVersion: string;
  DocumentInfoRecordDocPart: string;
  DocumentInfoRecord?: string;
  DocumentDescription?: string;
  ExternalDocumentStatus?: string;
  DocumentStatusName?: string;
  DocInfoRecdIsMarkedForDeletion?: boolean;
}

export interface AttachmentContentSet {
  DocumentInfoRecordDocType: string;
  DocumentInfoRecordDocNumber: string;
  DocumentInfoRecordDocVersion: string;
  DocumentInfoRecordDocPart: string;
  LogicalDocument: string;
  ArchiveDocumentID: string;
  LinkedSAPObjectKey: string;
  BusinessObjectTypeName: string;
  SemanticObject?: string;
  WorkstationApplication?: string;
  FileSize?: string;
  FileName?: string;
  DocumentURL?: string;
  MimeType?: string;
  Content?: string;
  CreatedByUser?: string;
  CreatedByUserFullName?: string;
  CreationDateTime?: string;
  BusinessObjectType?: string;
  LastChangedByUser?: string;
  LastChangedByUserFullName?: string;
  ChangedDateTime?: string;
  StorageCategory?: string;
  ArchiveLinkRepository?: string;
  SAPObjectType?: string;
  SAPObjectNodeType?: string;
  HarmonizedDocumentType?: string;
  AttachmentDeletionIsAllowed?: boolean;
  AttachmentRenameIsAllowed?: boolean;
  Source?: string;
  AttachmentContentHash?: string;
}

export interface AttachmentHarmonizedOperationSet {
  DocumentInfoRecordDocType?: string;
  DocumentInfoRecordDocNumber?: string;
  DocumentInfoRecordDocVersion?: string;
  DocumentInfoRecordDocPart?: string;
  LogicalDocument: string;
  ArchiveDocumentID: string;
  LinkedSAPObjectKey: string;
  BusinessObjectTypeName?: string;
  FileSize?: string;
  FileName?: string;
  MimeType?: string;
  CheckoutUser?: string;
  CheckoutUserFullName?: string;
  CreatedByUser?: string;
  CreatedByUserFullName?: string;
  CreationDateTime?: string;
  LastChangedByUser?: string;
  LastChangedByUserFullName?: string;
  ChangedDateTime?: string;
  StorageCategory?: string;
  ArchiveLinkRepository?: string;
  SAPObjectType: string;
  SAPObjectNodeType?: string;
  HarmonizedDocumentType: string;
  AttachmentDeletionIsAllowed?: boolean;
  AttachmentRenameIsAllowed?: boolean;
  URLToUploadAttachment?: string;
  URLToReadAttachment?: string;
  OneTimeValidTokenForAttachment?: string;
}

export interface AttachmentForSAPObjectNodeTypeSet {
  DocumentInfoRecordDocType?: string;
  DocumentInfoRecordDocNumber?: string;
  DocumentInfoRecordDocVersion?: string;
  DocumentInfoRecordDocPart?: string;
  LogicalDocument: string;
  ArchiveDocumentID: string;
  LinkedSAPObjectKey: string;
  BusinessObjectTypeName?: string;
  FileSize?: string;
  FileName?: string;
  MimeType?: string;
  CheckoutUser?: string;
  CheckoutUserFullName?: string;
  CreatedByUser?: string;
  CreatedByUserFullName?: string;
  CreationDateTime?: string;
  LastChangedByUser?: string;
  LastChangedByUserFullName?: string;
  ChangedDateTime?: string;
  StorageCategory?: string;
  ArchiveLinkRepository?: string;
  SAPObjectType: string;
  SAPObjectNodeType: string;
  HarmonizedDocumentType: string;
  AttachmentDeletionIsAllowed?: boolean;
  AttachmentRenameIsAllowed?: boolean;
  URLToUploadAttachment?: string;
  URLToReadAttachment?: string;
  OneTimeValidTokenForAttachment?: string;
}

export interface SAPObjectDocumentTypeSet {
  SAPObjectType: string;
  SAPObjectNodeType: string;
  HarmonizedDocumentType: string;
  DocumentTypeDescription?: string;
  PermittedArchiveLinkMimeType?: string;
  AttachmentFramework?: string;
  DocumentTypeIsDefault?: string;
}
