
/* Autogenerated file. Do not edit manually. */
/* tslint:disable */
/* eslint-disable */
import type { String, Int, BigInt, Float, ID, Bytes, Timestamp, Boolean } from '@sentio/sdk/store'
import { Entity, Required, One, Many, Column, ListColumn } from '@sentio/sdk/store'
import { BigDecimal } from '@sentio/bigdecimal'
import { DatabaseSchema } from '@sentio/sdk'






@Entity("AccountSnapshot")
export class AccountSnapshot  {

	@Required
	@Column("String")
	id: String

	@Required
	@Column("String")
	account: String

	@Required
	@Column("BigInt")
	timestampMilli: BigInt

	@Required
	@Column("BigDecimal")
	inceptionEthBalance: BigDecimal

  constructor(data: Partial<AccountSnapshot>) {}

}


const source = `type AccountSnapshot @entity {
  id: String!
  account: String!
  timestampMilli: BigInt!
  inceptionEthBalance: BigDecimal!
}`
DatabaseSchema.register({
  source,
  entities: {
    "AccountSnapshot": AccountSnapshot
  }
})