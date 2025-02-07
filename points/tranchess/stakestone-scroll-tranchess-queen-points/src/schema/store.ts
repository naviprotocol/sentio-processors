
/* Autogenerated file. Do not edit manually. */
/* tslint:disable */
/* eslint-disable */
import type { String, Int, BigInt, Float, ID, Bytes, Timestamp, Boolean } from '@sentio/sdk/store'
import { Entity, Required, One, Many, Column, ListColumn, AbstractEntity } from '@sentio/sdk/store'
import { BigDecimal } from '@sentio/bigdecimal'
import { DatabaseSchema } from '@sentio/sdk'







interface AccountSnapshotConstructorInput {
  id: ID;
  balance: BigInt;
  timestampMilli: BigInt;
}
@Entity("AccountSnapshot")
export class AccountSnapshot extends AbstractEntity  {

	@Required
	@Column("ID")
	id: ID

	@Required
	@Column("BigInt")
	balance: BigInt

	@Required
	@Column("BigInt")
	timestampMilli: BigInt
  constructor(data: AccountSnapshotConstructorInput) {super()}
}


const source = ` type AccountSnapshot @entity {
    id: ID!
    balance: BigInt!
    timestampMilli: BigInt!
}
`
DatabaseSchema.register({
  source,
  entities: {
    "AccountSnapshot": AccountSnapshot
  }
})
